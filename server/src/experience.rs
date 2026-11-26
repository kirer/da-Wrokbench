//! 员工经验：从现有需求、分工和开发任务里聚合「谁做过什么」，
//! 并按需求标题/文档找相似的历史需求。只读，不单独存一份会漂移的记忆快照。

use crate::db::Snapshot;
use crate::models::{Requirement, DEV_DONE, STATUS_CREATE_FAILED, STATUS_CREATING};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub fn report(snap: &Snapshot, query: &str, exclude: &str, limit: usize) -> Value {
    json!({
        "users": user_experience(snap),
        "matches": similar_requirements(snap, query, exclude, limit),
    })
}

fn platform_name(snap: &Snapshot, id: &str) -> String {
    snap.platforms
        .iter()
        .find(|platform| platform.id == id)
        .map(|platform| platform.short_name.clone())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| id.to_string())
}

fn project_name(snap: &Snapshot, requirement: &Requirement) -> Option<String> {
    let iteration = snap
        .iterations
        .iter()
        .find(|iteration| iteration.id == requirement.iteration_id)?;
    let project_id = iteration.project_id.as_deref()?;
    snap.projects
        .iter()
        .find(|project| project.id == project_id)
        .map(|project| project.name.clone())
}

struct Contribution {
    requirement_id: String,
    code: String,
    title: String,
    role: &'static str,
    platform_id: Option<String>,
    project: Option<String>,
    status: String,
    at: String,
}

fn add_contribution(
    by_user: &mut HashMap<String, Vec<Contribution>>,
    requirement: &Requirement,
    user_id: &str,
    role: &'static str,
    platform_id: Option<&str>,
    project: Option<&str>,
) {
    by_user
        .entry(user_id.to_string())
        .or_default()
        .push(Contribution {
            requirement_id: requirement.id.clone(),
            code: requirement.code.clone(),
            title: requirement.title.clone(),
            role,
            platform_id: platform_id.map(str::to_string),
            project: project.map(str::to_string),
            status: requirement.status.clone(),
            at: requirement.updated_at.clone(),
        });
}

fn user_experience(snap: &Snapshot) -> Vec<Value> {
    let mut by_user: HashMap<String, Vec<Contribution>> = HashMap::new();
    let mut open_tasks: HashMap<String, usize> = HashMap::new();
    for requirement in &snap.requirements {
        let project = project_name(snap, requirement);
        add_contribution(
            &mut by_user,
            requirement,
            &requirement.owner_id,
            "product",
            None,
            project.as_deref(),
        );
        if let Some(designer) = requirement.designer_id.as_deref() {
            add_contribution(
                &mut by_user,
                requirement,
                designer,
                "design",
                None,
                project.as_deref(),
            );
        }
        if let Some(tester) = requirement.tester_id.as_deref() {
            add_contribution(
                &mut by_user,
                requirement,
                tester,
                "qa",
                None,
                project.as_deref(),
            );
        }
        for task in &requirement.dev_tasks {
            let Some(assignee) = task.assignee_id.as_deref() else {
                continue;
            };
            add_contribution(
                &mut by_user,
                requirement,
                assignee,
                "dev",
                Some(task.platform_id.as_str()),
                project.as_deref(),
            );
            if task.status != DEV_DONE {
                *open_tasks.entry(assignee.to_string()).or_default() += 1;
            }
        }
    }
    let mut users: Vec<Value> = snap
        .users
        .iter()
        .filter(|user| user.active)
        .filter_map(|user| {
            let contributions = by_user.remove(user.id.as_str())?;
            let mut requirement_ids = HashSet::new();
            let mut projects = HashSet::new();
            let mut platform_counts: HashMap<String, usize> = HashMap::new();
            for item in &contributions {
                requirement_ids.insert(item.requirement_id.clone());
                if let Some(project) = item.project.as_deref() {
                    projects.insert(project.to_string());
                }
                if item.role == "dev" {
                    if let Some(id) = item.platform_id.as_deref() {
                        *platform_counts.entry(id.to_string()).or_default() += 1;
                    }
                }
            }
            let mut recent = contributions;
            recent.sort_by(|a, b| b.at.cmp(&a.at));
            let recent: Vec<Value> = recent
                .iter()
                .take(5)
                .map(|item| {
                    json!({
                        "code": item.code,
                        "title": item.title,
                        "role": item.role,
                        "platformId": item.platform_id,
                        "platform": item.platform_id.as_deref().map(|id| platform_name(snap, id)),
                        "project": item.project,
                        "status": item.status,
                        "at": item.at,
                    })
                })
                .collect();
            let mut platform_stats: Vec<(String, usize)> = platform_counts.into_iter().collect();
            platform_stats.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            let platforms: Vec<Value> = platform_stats
                .into_iter()
                .map(|(id, count)| {
                    let name = platform_name(snap, &id);
                    json!({
                        "id": id,
                        "name": name,
                        "requirements": count,
                    })
                })
                .collect();
            Some(json!({
                "id": user.id,
                "name": user.name,
                "roles": user.roles,
                "requirements": requirement_ids.len(),
                "projects": projects.len(),
                "openTasks": open_tasks.get(user.id.as_str()).copied().unwrap_or(0),
                "platforms": platforms,
                "recent": recent,
            }))
        })
        .collect();
    users.sort_by(|a, b| {
        b["requirements"]
            .as_u64()
            .cmp(&a["requirements"].as_u64())
            .then_with(|| a["name"].as_str().cmp(&b["name"].as_str()))
    });
    users
}

fn similar_requirements(
    snap: &Snapshot,
    query: &str,
    exclude: &str,
    limit: usize,
) -> Vec<Value> {
    let query_terms = terms(query);
    if query_terms.is_empty() {
        return Vec::new();
    }
    let limit = limit.clamp(1, 10);
    let mut scored: Vec<(i64, &Requirement)> = snap
        .requirements
        .iter()
        .filter(|requirement| {
            requirement.id != exclude
                && requirement.status != STATUS_CREATING
                && requirement.status != STATUS_CREATE_FAILED
        })
        .filter_map(|requirement| {
            let score = score_requirement(requirement, &query_terms);
            (score > 0).then_some((score, requirement))
        })
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.updated_at.cmp(&a.1.updated_at)));
    scored.truncate(limit);
    scored
        .into_iter()
        .map(|(score, requirement)| {
            let iteration = snap
                .iterations
                .iter()
                .find(|iteration| iteration.id == requirement.iteration_id);
            let summary_text = if !requirement.document.summary.trim().is_empty() {
                requirement.document.summary.as_str()
            } else {
                requirement.document.body.as_str()
            };
            let summary: String = summary_text
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(160)
                .collect();
            let platforms: Vec<Value> = requirement
                .platform_ids
                .iter()
                .map(|id| json!({"id": id, "name": platform_name(snap, id)}))
                .collect();
            json!({
                "id": requirement.id,
                "code": requirement.code,
                "title": requirement.title,
                "status": requirement.status,
                "score": score,
                "summary": summary,
                "iterationCode": iteration.map(|item| item.code.clone()),
                "projectName": project_name(snap, requirement),
                "platforms": platforms,
                "contributors": contributors(snap, requirement),
            })
        })
        .collect()
}

fn contributors(snap: &Snapshot, requirement: &Requirement) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    let mut add = |user_id: &str, role: &str, platform_id: Option<&str>| {
        let key = format!("{user_id}|{role}|{}", platform_id.unwrap_or(""));
        if !seen.insert(key) {
            return;
        }
        let name = snap
            .users
            .iter()
            .find(|user| user.id == user_id)
            .map(|user| user.name.clone())
            .unwrap_or_else(|| user_id.to_string());
        result.push(json!({
            "id": user_id,
            "name": name,
            "role": role,
            "platformId": platform_id,
            "platform": platform_id.map(|id| platform_name(snap, id)),
        }));
    };
    add(&requirement.owner_id, "product", None);
    if let Some(designer) = requirement.designer_id.as_deref() {
        add(designer, "design", None);
    }
    if let Some(tester) = requirement.tester_id.as_deref() {
        add(tester, "qa", None);
    }
    for task in &requirement.dev_tasks {
        if let Some(assignee) = task.assignee_id.as_deref() {
            add(assignee, "dev", Some(task.platform_id.as_str()));
        }
    }
    result
}

fn score_requirement(requirement: &Requirement, query: &HashSet<String>) -> i64 {
    let title = terms(&requirement.title);
    let summary = terms(&requirement.document.summary);
    let body = terms(&requirement.document.body);
    query
        .iter()
        .map(|term| {
            if title.contains(term) {
                3
            } else if summary.contains(term) {
                2
            } else if body.contains(term) {
                1
            } else {
                0
            }
        })
        .sum()
}

/// 中文按二元组切分，英文/数字按词切分；比纯子串匹配更能承受措辞差异。
fn terms(text: &str) -> HashSet<String> {
    let mut result = HashSet::new();
    let mut run: Vec<char> = Vec::new();
    let mut cjk: Option<bool> = None;
    let flush = |run: &[char], cjk: bool, result: &mut HashSet<String>| {
        if run.is_empty() {
            return;
        }
        if cjk {
            if run.len() == 1 {
                result.insert(run[0].to_string());
                return;
            }
            for pair in run.windows(2) {
                result.insert(pair.iter().collect());
            }
        } else {
            let word: String = run.iter().collect();
            if word.chars().count() >= 2 {
                result.insert(word);
            }
        }
    };
    for ch in text.to_lowercase().chars() {
        let kind = if ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            Some(true)
        } else if ch.is_alphanumeric() {
            Some(false)
        } else {
            None
        };
        match kind {
            Some(cjk_kind) => {
                if cjk != Some(cjk_kind) {
                    if let Some(previous) = cjk {
                        flush(&run, previous, &mut result);
                    }
                    run.clear();
                    cjk = Some(cjk_kind);
                }
                run.push(ch);
            }
            None => {
                if let Some(previous) = cjk {
                    flush(&run, previous, &mut result);
                }
                run.clear();
                cjk = None;
            }
        }
    }
    if let Some(previous) = cjk {
        flush(&run, previous, &mut result);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot() -> Snapshot {
        serde_json::from_value(json!({
            "users": [
                {"id": "lisi", "name": "李四", "roles": ["product"], "active": true},
                {"id": "wangwu", "name": "王五", "roles": ["dev"], "platforms": ["trade-server"], "active": true},
                {"id": "zhaoliu", "name": "赵六", "roles": ["dev"], "platforms": ["web"], "active": true}
            ],
            "groups": [],
            "platforms": [
                {"id": "trade-server", "groupId": "server", "name": "交易服务端", "shortName": "交易", "order": 1, "active": true, "leadIds": []},
                {"id": "web", "groupId": "frontend", "name": "Web", "shortName": "Web", "order": 1, "active": true, "leadIds": []}
            ],
            "projects": [{"id": "p1", "name": "云栖民宿"}],
            "iterations": [{"id": "it1", "projectId": "p1", "code": "HOM-2026-12", "shortCode": "HOM-12", "name": "房源与搜索"}],
            "requirements": [
                {
                    "id": "req-old", "code": "12-002", "title": "积分商城改版", "iterationId": "it1",
                    "status": "released", "designStatus": "not_needed", "platformIds": ["trade-server", "web"],
                    "ownerId": "lisi", "updatedAt": "2026-11-01T00:00:00Z", "createdAt": "2026-10-01T00:00:00Z",
                    "document": {"summary": "积分兑换和会员权益", "body": "用户可以用积分兑换商品，涉及交易服务端和 Web。"},
                    "devTasks": [
                        {"id": "d1", "platformId": "trade-server", "assigneeId": "wangwu", "status": "done"},
                        {"id": "d2", "platformId": "web", "assigneeId": "zhaoliu", "status": "done"}
                    ]
                },
                {
                    "id": "req-new", "code": "12-003", "title": "会员积分兑换", "iterationId": "it1",
                    "status": "draft", "designStatus": "unclaimed", "platformIds": ["web"],
                    "ownerId": "lisi", "updatedAt": "2026-11-02T00:00:00Z", "createdAt": "2026-11-02T00:00:00Z",
                    "document": {"summary": "会员积分兑换入口", "body": ""},
                    "devTasks": []
                }
            ],
            "skills": []
        }))
        .expect("fixture snapshot")
    }

    #[test]
    fn finds_similar_requirements_with_contributors() {
        let snap = snapshot();
        let report = report(&snap, "会员积分兑换", "req-new", 5);
        let matches = report["matches"].as_array().expect("matches");
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0]["code"], "12-002");
        let contributors = matches[0]["contributors"].as_array().expect("contributors");
        assert!(contributors
            .iter()
            .any(|item| item["name"] == "王五" && item["platformId"] == "trade-server"));
    }

    #[test]
    fn aggregates_user_experience_and_open_tasks() {
        let mut snap = snapshot();
        snap.requirements[0].dev_tasks[0].status = "in_progress".to_string();
        let users = report(&snap, "", "", 5)["users"].clone();
        let users = users.as_array().expect("users");
        let wangwu = users
            .iter()
            .find(|user| user["id"] == "wangwu")
            .expect("wangwu");
        assert_eq!(wangwu["requirements"], 1);
        assert_eq!(wangwu["openTasks"], 1);
        assert_eq!(wangwu["platforms"][0]["id"], "trade-server");
        assert_eq!(wangwu["recent"][0]["project"], "云栖民宿");
    }
}
