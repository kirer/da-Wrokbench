//! 请求来源 IP 提取（含反向代理下的真实 IP 解析）。
//!
//! 从 api.rs 拆出：只有受信代理（回环或 WORKBENCH_TRUSTED_PROXIES 网段）才采信
//! X-Forwarded-For / X-Real-IP，否则任何人都能伪造来源绕过按 IP 的限流。

use axum::extract::FromRequestParts;
use axum::http::request::Parts;

/// 登录/Webhook 入口的来源地址。取不到 peer（Unix socket、内嵌测试）时统一
/// 记成 "unknown"，不返回错误——限流不能成为拒绝服务的新入口。
pub struct ClientIp(String);

impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let peer = parts
            .extensions
            .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
            .map(|info| info.0.ip());
        let mut client = peer
            .map(|ip| ip.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        // 反代/容器部署下，直连来源都是代理 IP；只有来源是受信代理（回环或
        // WORKBENCH_TRUSTED_PROXIES 配置的网段）时才采信 X-Forwarded-For / X-Real-IP，
        // 否则任何人都能伪造来源、绕过按 IP 的限流。
        if let Some(peer_ip) = peer {
            if peer_is_trusted(&peer_ip) {
                let forwarded = parts
                    .headers
                    .get("x-forwarded-for")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.split(',').next())
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                let real = parts
                    .headers
                    .get("x-real-ip")
                    .and_then(|value| value.to_str().ok())
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                if let Some(ip) = forwarded.or(real) {
                    client = ip.to_string();
                }
            }
        }
        Ok(ClientIp(client))
    }
}

impl ClientIp {
    pub(crate) fn key(&self, route: &str) -> String {
        format!("{route}:{}", self.0)
    }
}

/// 解析 WORKBENCH_TRUSTED_PROXIES（逗号分隔，支持 ip 或 ip/prefix）。
fn parse_trusted_proxies(raw: &str) -> Vec<(std::net::IpAddr, u8)> {
    raw.split(',')
        .filter_map(|item| {
            let item = item.trim();
            if item.is_empty() {
                return None;
            }
            let (ip_part, prefix) = match item.split_once('/') {
                Some((ip, prefix)) => (ip, prefix.parse::<u8>().ok()?),
                None => (item, if item.contains(':') { 128 } else { 32 }),
            };
            let ip: std::net::IpAddr = ip_part.parse().ok()?;
            Some((ip, prefix))
        })
        .collect()
}

fn trusted_proxies() -> &'static Vec<(std::net::IpAddr, u8)> {
    static CACHE: std::sync::OnceLock<Vec<(std::net::IpAddr, u8)>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| {
        std::env::var("WORKBENCH_TRUSTED_PROXIES")
            .ok()
            .map(|value| parse_trusted_proxies(&value))
            .unwrap_or_default()
    })
}

fn ip_in_net(ip: &std::net::IpAddr, net: &std::net::IpAddr, prefix: u8) -> bool {
    match (ip, net) {
        (std::net::IpAddr::V4(a), std::net::IpAddr::V4(b)) => {
            let bits = prefix.min(32) as u32;
            let mask = if bits == 0 {
                0
            } else {
                u32::MAX << (32 - bits)
            };
            (u32::from(*a) & mask) == (u32::from(*b) & mask)
        }
        (std::net::IpAddr::V6(a), std::net::IpAddr::V6(b)) => {
            let bits = prefix.min(128) as u32;
            let shift = 128u32.saturating_sub(bits);
            let mask = if shift >= 128 { 0 } else { u128::MAX << shift };
            (u128::from(*a) & mask) == (u128::from(*b) & mask)
        }
        _ => false,
    }
}

fn peer_is_trusted(ip: &std::net::IpAddr) -> bool {
    if ip.is_loopback() {
        return true;
    }
    trusted_proxies()
        .iter()
        .any(|(net, prefix)| ip_in_net(ip, net, *prefix))
}
