use crate::models::*;
use serde_json::json;

pub fn users() -> Vec<User> {
    let ids = [
        ("zhangsan", "张三", vec![ROLE_LEAD], vec![]),
        ("lisi", "李四", vec![ROLE_PRODUCT], vec![]),
        ("wangwu", "王五", vec![ROLE_DESIGN], vec![]),
        (
            "zhaoliu",
            "赵六",
            vec![ROLE_DEV],
            vec!["trade-server", "user-server"],
        ),
        ("sunba", "孙八", vec![ROLE_DEV], vec!["web", "miniprogram"]),
        ("qianqi", "钱七", vec![ROLE_QA], vec![]),
        (
            "zhoujiu",
            "周九",
            vec![ROLE_DEV],
            vec!["ios", "android", "harmony"],
        ),
        ("admin", "管理员", vec![ROLE_ADMIN], vec![]),
    ];
    ids.into_iter()
        .map(|(id, name, roles, platforms)| {
            let role_list: Vec<String> = roles.iter().map(|value| value.to_string()).collect();
            let platform_list: Vec<String> =
                platforms.iter().map(|value| value.to_string()).collect();
            User {
                id: id.to_string(),
                name: name.to_string(),
                roles: role_list.clone(),
                platforms: platform_list.clone(),
                active_platform_ids: platform_list,
                active_role: role_list.first().cloned(),
                active: true,
                onboarding_completed_at: Some("2026-11-01T02:00:00.000Z".to_string()),
                folder_configured: true,
                dingtalk_user_id: None,
                dingtalk_union_id: None,
                dingtalk_open_id: None,
                mobile: None,
                avatar_url: None,
                title: None,
                department_ids: Vec::new(),
                current_iteration_id: Some("iteration-2026-s11".to_string()),
            }
        })
        .collect()
}

pub fn platform_groups() -> Vec<PlatformGroup> {
    vec![
        PlatformGroup {
            id: "server".into(),
            name: "服务端组".into(),
            order: 1,
            active: true,
            supports_api_doc: true,
        },
        PlatformGroup {
            id: "frontend".into(),
            name: "前端组".into(),
            order: 2,
            active: true,
            supports_api_doc: false,
        },
        PlatformGroup {
            id: "client".into(),
            name: "客户端组".into(),
            order: 3,
            active: true,
            supports_api_doc: false,
        },
        PlatformGroup {
            id: "middle".into(),
            name: "中台组".into(),
            order: 4,
            active: false,
            supports_api_doc: true,
        },
    ]
}

pub fn platforms() -> Vec<Platform> {
    let rows = [
        ("trade-server", "server", "交易服务端", "交易", 1, true),
        ("goods-server", "server", "商品服务端", "商品", 2, true),
        ("user-server", "server", "用户服务端", "用户", 3, true),
        ("web", "frontend", "Web", "Web", 1, true),
        ("miniprogram", "frontend", "小程序", "小程序", 2, true),
        ("ios", "client", "iOS", "iOS", 1, true),
        ("android", "client", "Android", "Android", 2, true),
        ("harmony", "client", "鸿蒙", "鸿蒙", 3, true),
        ("middle-platform", "middle", "中台", "中台", 1, false),
    ];
    rows.into_iter()
        .map(|(id, group_id, name, short_name, order, active)| Platform {
            id: id.into(),
            group_id: group_id.into(),
            name: name.into(),
            short_name: short_name.into(),
            order,
            active,
            owner_id: None,
            lead_ids: Vec::new(),
            gitlab_project_id: None,
            gitlab_project_path: None,
        })
        .collect()
}

pub fn iterations() -> Vec<Iteration> {
    vec![
        Iteration {
            id: "iteration-2026-s11".into(),
            code: "2026-S11".into(),
            short_code: "S11".into(),
            name: "双十一会员增长".into(),
            phase: "需求 / 设计 / 开发 / 测试".into(),
            status: "in_progress".into(),
            start_date: "2026-11-02".into(),
            end_date: "2026-11-29".into(),
            owner_id: Some("zhangsan".into()),
            reviewer_ids: vec!["zhangsan".into()],
            archived: false,
            created_at: "2026-11-01T09:00:00.000Z".into(),
        },
        Iteration {
            id: "iteration-2026-s12".into(),
            code: "2026-S12".into(),
            short_code: "S12".into(),
            name: "双十二会员增长".into(),
            phase: "需求 / 设计".into(),
            status: "planning".into(),
            start_date: "2026-12-01".into(),
            end_date: "2026-12-31".into(),
            owner_id: Some("zhangsan".into()),
            reviewer_ids: vec!["zhangsan".into(), "admin".into()],
            archived: false,
            created_at: "2026-11-21T08:00:00.000Z".into(),
        },
    ]
}

fn base_requirement(id: &str, code: &str, title: &str, iteration_id: &str) -> Requirement {
    Requirement {
        id: id.into(),
        code: code.into(),
        title: title.into(),
        iteration_id: iteration_id.into(),
        status: STATUS_DRAFT.into(),
        design_status: DESIGN_UNCLAIMED.into(),
        platform_ids: vec![],
        owner_id: "lisi".into(),
        designer_id: None,
        in_scope: false,
        versions: vec![],
        design_versions: vec![],
        reviews: vec![],
        reviewer_ids: vec![],
        scope_changes: vec![],
        sessions: vec![],
        primary_session_id: None,
        planned_start_date: None,
        planned_end_date: None,
        scheduled_at: None,
        scheduled_by: None,
        design_delivered_at: None,
        design_updated_at: None,
        dev_tasks: vec![],
        test_runs: vec![],
        release: None,
        document: RequirementDocument::default(),
        artifacts: vec![],
        create_error: None,
        created_at: "2026-11-16T09:20:00.000Z".into(),
        updated_at: "2026-11-22T02:15:00.000Z".into(),
    }
}

fn version(version: u32, summary: &str, at: &str) -> Version {
    Version {
        version,
        summary: summary.into(),
        at: at.into(),
        by: "lisi".into(),
    }
}

fn design_version(version: u32, summary: &str, at: &str) -> DesignVersion {
    DesignVersion {
        version,
        summary: summary.into(),
        at: at.into(),
        by: "wangwu".into(),
        files: vec![],
        artifact_ids: vec![],
    }
}

fn review(decision: &str, comment: &str, at: &str, by: &str) -> Review {
    Review {
        id: format!("review-{}", uuid::Uuid::new_v4()),
        version: 1,
        decision: decision.into(),
        comment: comment.into(),
        at: at.into(),
        by: by.into(),
    }
}

fn dev_task(
    platform_id: &str,
    assignee: Option<&str>,
    status: &str,
    started_at: Option<&str>,
    finished_at: Option<&str>,
) -> DevTask {
    DevTask {
        id: format!("dev-{}", uuid::Uuid::new_v4()),
        platform_id: platform_id.into(),
        assignee_id: assignee.map(String::from),
        status: status.into(),
        started_at: started_at.map(String::from),
        finished_at: finished_at.map(String::from),
        branch: if status == DEV_DONE {
            Some(format!("feature/{platform_id}-s11"))
        } else {
            None
        },
        mr_url: if status == DEV_DONE {
            Some(format!(
                "https://gitlab.example.com/member/workbench/-/merge_requests/{}",
                platform_id.len() + 120
            ))
        } else {
            None
        },
        pipeline_status: if status == DEV_DONE {
            Some("success".into())
        } else if status == DEV_IN_PROGRESS {
            Some("running".into())
        } else {
            None
        },
        pipeline_url: if status == DEV_DONE || status == DEV_IN_PROGRESS {
            Some("https://gitlab.example.com/member/workbench/-/pipelines/8801".into())
        } else {
            None
        },
        note: String::new(),
    }
}

pub fn requirements() -> Vec<Requirement> {
    let mut out = Vec::new();

    let mut r1 = base_requirement("req-seed-001", "S11-001", "会员积分改版", "iteration-2026-s11");
    r1.status = STATUS_IN_PROGRESS.into();
    r1.design_status = DESIGN_DELIVERED.into();
    r1.platform_ids = vec![
        "trade-server".into(),
        "goods-server".into(),
        "web".into(),
        "ios".into(),
    ];
    r1.designer_id = Some("wangwu".into());
    r1.in_scope = true;
    r1.versions = vec![
        version(1, "初始需求：积分获取、抵扣与过期规则", "2026-11-16T09:20:00.000Z"),
        version(2, "补充抵扣上限 20%，新增积分明细入口", "2026-11-20T15:10:00.000Z"),
    ];
    r1.design_versions = vec![
        design_version(1, "积分首页与明细页初稿", "2026-11-17T07:40:00.000Z"),
        design_version(2, "积分明细页补充抵扣上限与过期提示", "2026-11-21T09:10:00.000Z"),
    ];
    r1.design_delivered_at = Some("2026-11-17T07:40:00.000Z".into());
    r1.design_updated_at = Some("2026-11-21T09:10:00.000Z".into());
    r1.planned_start_date = Some("2026-11-18".into());
    r1.planned_end_date = Some("2026-11-24".into());
    r1.scheduled_at = Some("2026-11-17T10:00:00.000Z".into());
    r1.scheduled_by = Some("zhangsan".into());
    r1.dev_tasks = vec![
        dev_task(
            "trade-server",
            Some("zhaoliu"),
            DEV_DONE,
            Some("2026-11-18T02:00:00.000Z"),
            Some("2026-11-20T09:30:00.000Z"),
        ),
        dev_task(
            "goods-server",
            Some("zhaoliu"),
            DEV_DONE,
            Some("2026-11-18T03:00:00.000Z"),
            Some("2026-11-20T10:00:00.000Z"),
        ),
        dev_task(
            "web",
            Some("sunba"),
            DEV_IN_PROGRESS,
            Some("2026-11-19T02:30:00.000Z"),
            None,
        ),
        dev_task("ios", Some("zhoujiu"), DEV_ASSIGNED, None, None),
    ];
    r1.reviews = vec![review(
        "approved",
        "范围清晰，按计划进入开发",
        "2026-11-17T09:30:00.000Z",
        "zhangsan",
    )];
    out.push(r1);

    let mut r2 = base_requirement("req-seed-002", "S11-002", "积分规则说明页", "iteration-2026-s11");
    r2.status = STATUS_PENDING_REVIEW.into();
    r2.design_status = DESIGN_NONE.into();
    r2.platform_ids = vec!["goods-server".into(), "web".into()];
    r2.versions = vec![version(
        1,
        "规则说明页初稿，无需设计",
        "2026-11-21T08:40:00.000Z",
    )];
    out.push(r2);

    let mut r3 = base_requirement("req-seed-003", "S11-003", "会员中心改版", "iteration-2026-s11");
    r3.status = STATUS_TEST_FAILED.into();
    r3.design_status = DESIGN_DELIVERED.into();
    r3.platform_ids = vec!["user-server".into(), "ios".into(), "android".into()];
    r3.designer_id = Some("wangwu".into());
    r3.in_scope = true;
    r3.versions = vec![version(
        1,
        "会员中心信息架构与首页改版",
        "2026-11-14T06:30:00.000Z",
    )];
    r3.design_versions = vec![design_version(
        1,
        "会员中心首页、权益页与积分页",
        "2026-11-15T11:05:00.000Z",
    )];
    r3.design_delivered_at = Some("2026-11-15T11:05:00.000Z".into());
    r3.planned_start_date = Some("2026-11-16".into());
    r3.planned_end_date = Some("2026-11-22".into());
    r3.scheduled_at = Some("2026-11-15T13:00:00.000Z".into());
    r3.scheduled_by = Some("zhangsan".into());
    r3.dev_tasks = vec![
        dev_task(
            "user-server",
            Some("zhaoliu"),
            DEV_DONE,
            Some("2026-11-16T02:00:00.000Z"),
            Some("2026-11-19T08:00:00.000Z"),
        ),
        dev_task(
            "ios",
            Some("zhoujiu"),
            DEV_DONE,
            Some("2026-11-16T03:00:00.000Z"),
            Some("2026-11-20T09:00:00.000Z"),
        ),
        dev_task(
            "android",
            Some("zhoujiu"),
            DEV_DONE,
            Some("2026-11-16T03:00:00.000Z"),
            Some("2026-11-20T09:30:00.000Z"),
        ),
    ];
    r3.test_runs = vec![TestRun {
        id: "test-seed-003".into(),
        status: "failed".into(),
        started_at: "2026-11-22T01:00:00.000Z".into(),
        finished_at: Some("2026-11-22T02:04:00.000Z".into()),
        by: "qianqi".into(),
        note: "iOS 权益页切换账号后闪退；Android 积分明细为空".into(),
        bug_url: Some("https://bug.example.com/BUG-2211".into()),
    }];
    out.push(r3);

    let mut r4 = base_requirement("req-seed-004", "S11-004", "积分商城入口", "iteration-2026-s11");
    r4.status = STATUS_SCHEDULED.into();
    r4.platform_ids = vec!["trade-server".into(), "web".into()];
    r4.in_scope = true;
    r4.versions = vec![version(
        1,
        "积分商城入口与跳转规则",
        "2026-11-19T03:20:00.000Z",
    )];
    r4.planned_start_date = Some("2026-11-24".into());
    r4.planned_end_date = Some("2026-11-28".into());
    r4.scheduled_at = Some("2026-11-21T09:05:00.000Z".into());
    r4.scheduled_by = Some("zhangsan".into());
    r4.reviews = vec![review(
        "approved",
        "入口位置与埋点补充后通过",
        "2026-11-21T08:50:00.000Z",
        "zhangsan",
    )];
    r4.dev_tasks = vec![
        dev_task("trade-server", None, DEV_UNASSIGNED, None, None),
        dev_task("web", None, DEV_UNASSIGNED, None, None),
    ];
    out.push(r4);

    let mut r5 = base_requirement("req-seed-005", "S11-005", "会员等级体系", "iteration-2026-s11");
    r5.status = STATUS_BACKLOG.into();
    r5.design_status = DESIGN_DELIVERED.into();
    r5.platform_ids = vec!["goods-server".into(), "miniprogram".into()];
    r5.designer_id = Some("wangwu".into());
    r5.versions = vec![version(
        1,
        "会员等级与成长值方案",
        "2026-11-12T04:20:00.000Z",
    )];
    r5.design_versions = vec![design_version(
        1,
        "等级体系概念稿",
        "2026-11-13T09:00:00.000Z",
    )];
    r5.design_delivered_at = Some("2026-11-13T09:00:00.000Z".into());
    r5.reviews = vec![review(
        "approved",
        "方案通过，但本期资源不足先暂缓",
        "2026-11-14T02:00:00.000Z",
        "zhangsan",
    )];
    r5.scope_changes = vec![ScopeChange {
        at: "2026-11-20T08:00:00.000Z".into(),
        by: "zhangsan".into(),
        in_scope: false,
        reason: "本期服务端资源不足，顺延到下个迭代".into(),
    }];
    out.push(r5);

    let mut r6 = base_requirement("req-seed-006", "S11-006", "积分过期提醒", "iteration-2026-s11");
    r6.design_status = DESIGN_UNCLAIMED.into();
    r6.platform_ids = vec!["user-server".into(), "web".into()];
    r6.created_at = "2026-11-22T01:30:00.000Z".into();
    r6.updated_at = "2026-11-22T01:30:00.000Z".into();
    out.push(r6);

    let mut r7 = base_requirement("req-seed-007", "S11-007", "会员权益说明", "iteration-2026-s11");
    r7.status = STATUS_TEST_PASSED.into();
    r7.design_status = DESIGN_DELIVERED.into();
    r7.platform_ids = vec!["trade-server".into(), "web".into()];
    r7.designer_id = Some("wangwu".into());
    r7.in_scope = true;
    r7.versions = vec![version(
        1,
        "权益说明页与领取规则",
        "2026-11-16T07:00:00.000Z",
    )];
    r7.design_versions = vec![design_version(
        1,
        "权益说明页设计稿",
        "2026-11-18T03:00:00.000Z",
    )];
    r7.design_delivered_at = Some("2026-11-18T03:00:00.000Z".into());
    r7.planned_start_date = Some("2026-11-19".into());
    r7.planned_end_date = Some("2026-11-22".into());
    r7.scheduled_at = Some("2026-11-18T08:00:00.000Z".into());
    r7.scheduled_by = Some("zhangsan".into());
    r7.dev_tasks = vec![
        dev_task(
            "trade-server",
            Some("zhaoliu"),
            DEV_DONE,
            Some("2026-11-19T02:00:00.000Z"),
            Some("2026-11-20T06:00:00.000Z"),
        ),
        dev_task(
            "web",
            Some("sunba"),
            DEV_DONE,
            Some("2026-11-19T03:00:00.000Z"),
            Some("2026-11-20T08:00:00.000Z"),
        ),
    ];
    r7.test_runs = vec![TestRun {
        id: "test-seed-007".into(),
        status: "passed".into(),
        started_at: "2026-11-21T01:00:00.000Z".into(),
        finished_at: Some("2026-11-21T02:10:00.000Z".into()),
        by: "qianqi".into(),
        note: "主流程与异常分支通过".into(),
        bug_url: None,
    }];
    out.push(r7);

    let mut r8 = base_requirement("req-seed-008", "S11-008", "会员日投放页", "iteration-2026-s11");
    r8.status = STATUS_RELEASED.into();
    r8.design_status = DESIGN_DELIVERED.into();
    r8.platform_ids = vec![
        "trade-server".into(),
        "miniprogram".into(),
        "ios".into(),
        "android".into(),
    ];
    r8.designer_id = Some("wangwu".into());
    r8.in_scope = true;
    r8.versions = vec![version(
        1,
        "会员日投放页与优惠券承接",
        "2026-11-08T06:00:00.000Z",
    )];
    r8.design_versions = vec![design_version(
        1,
        "投放页三端设计稿",
        "2026-11-10T05:00:00.000Z",
    )];
    r8.design_delivered_at = Some("2026-11-10T05:00:00.000Z".into());
    r8.planned_start_date = Some("2026-11-10".into());
    r8.planned_end_date = Some("2026-11-14".into());
    r8.scheduled_at = Some("2026-11-09T08:00:00.000Z".into());
    r8.scheduled_by = Some("zhangsan".into());
    r8.dev_tasks = vec![
        dev_task(
            "trade-server",
            Some("zhaoliu"),
            DEV_DONE,
            Some("2026-11-10T02:00:00.000Z"),
            Some("2026-11-11T08:00:00.000Z"),
        ),
        dev_task(
            "miniprogram",
            Some("sunba"),
            DEV_DONE,
            Some("2026-11-10T03:00:00.000Z"),
            Some("2026-11-11T09:00:00.000Z"),
        ),
        dev_task(
            "ios",
            Some("zhoujiu"),
            DEV_DONE,
            Some("2026-11-10T03:00:00.000Z"),
            Some("2026-11-12T06:00:00.000Z"),
        ),
        dev_task(
            "android",
            Some("zhoujiu"),
            DEV_DONE,
            Some("2026-11-10T03:00:00.000Z"),
            Some("2026-11-12T06:30:00.000Z"),
        ),
    ];
    r8.test_runs = vec![TestRun {
        id: "test-seed-008".into(),
        status: "passed".into(),
        started_at: "2026-11-12T07:00:00.000Z".into(),
        finished_at: Some("2026-11-12T08:30:00.000Z".into()),
        by: "qianqi".into(),
        note: "投放与领券链路通过".into(),
        bug_url: None,
    }];
    r8.release = Some(ReleaseInfo {
        version: "v1.2.0".into(),
        at: "2026-11-13T02:00:00.000Z".into(),
        by: "zhangsan".into(),
    });
    out.push(r8);

    let mut r9 = base_requirement("req-seed-s12-001", "S12-001", "双十二会场", "iteration-2026-s12");
    r9.status = STATUS_PENDING_REVIEW.into();
    r9.platform_ids = vec!["trade-server".into(), "web".into(), "ios".into()];
    r9.versions = vec![version(
        1,
        "双十二会场结构、互动玩法与承接链路",
        "2026-11-21T09:20:00.000Z",
    )];
    r9.reviewer_ids = vec!["zhangsan".into(), "admin".into()];
    r9.reviews = vec![review(
        "approved",
        "会场结构没问题，等待管理员确认资源",
        "2026-11-21T10:00:00.000Z",
        "zhangsan",
    )];
    r9.created_at = "2026-11-21T09:20:00.000Z".into();
    r9.updated_at = "2026-11-21T10:00:00.000Z".into();
    out.push(r9);

    out
}

fn skill_content(name: &str) -> &'static str {
    match name {
        "req-submit" => "# 提交需求\n\n1. 确认需求编号。\n2. 调用 `workbench_submit_requirement` 提交并写摘要。\n3. 只汇报工具返回的状态。",
        "req-review" => "# 评审需求\n\n1. 确认需求为待评审。\n2. 向用户确认通过或退回。\n3. 调用 `workbench_review_requirement`。\n4. 多评审人时，全部通过才进入已通过。",
        "req-schedule" => "# 需求排期\n\n1. 确认需求已通过且在本期。\n2. 确认开始/结束日期。\n3. 调用 `workbench_schedule_requirement`。",
        "req-scope" => "# 范围调整\n\n1. 确认纳入还是移出以及原因。\n2. 调用 `workbench_scope_requirement`。\n3. 范围变更会记录历史。",
        "req-reviewers" => "# 设置会签人\n\n1. 只在待评审阶段设置。\n2. 调用 `workbench_set_reviewers`，传用户 id 列表。\n3. 所有人通过才算评审通过。",
        "req-move" => "# 跨迭代移动\n\n1. 确认目标和原因。\n2. 调用 `workbench_move_requirement`，服务端会按目标迭代重新编号。",
        "iteration-plan" => "# 迭代排期\n\n调用 `workbench_iteration_status` 概览，再逐条评审、排期、调整范围。",
        "iteration-edit" => "# 迭代管理\n\n调用 `workbench_iteration_update` 修改名称、状态、日期或会签人；结束后提醒归档。",
        "design-claim" => "# 认领设计\n\n调用 `workbench_claim_design`；已有其他设计负责人时会被拒绝。",
        "design-start" => "# 开始设计\n\n1. 调用 `workbench_design_context`。\n2. 认领设计。\n3. 在需求文件夹里产出 HTML 设计稿并预览自查。",
        "design-deliver" => "# 交付设计\n\n1. 确认需求文件夹和设计文件。\n2. 调用 `workbench_deliver_design`。\n3. 开发开始后交付会标记设计已更新。",
        "dev-assign" => "# 指派开发\n\n调用 `workbench_dev_assign`，传平台和开发负责人；开发负责人也可自行认领。",
        "dev-start" => "# 开始开发\n\n调用 `workbench_dev_start`；服务端记录真实开发开始时间，用于判断晚到设计。",
        "dev-finish" => "# 完成开发\n\n调用 `workbench_dev_finish`；服务端生成 Mock MR 与流水线状态，全部平台完成后进入待测试。",
        "test-verify" => "# 测试验证\n\n1. 调用 `workbench_test_start` 开始测试。\n2. 通过用 `workbench_test_pass`，失败用 `workbench_test_fail` 并写缺陷链接。",
        "release-freeze" => "# 冻结与发布\n\n测试通过后调用 `workbench_freeze`；发布时调用 `workbench_release` 记录版本号。",
        _ => "# 技能\n\n按描述执行。",
    }
}

fn seed_skill(
    name: &str,
    description: &str,
    role_packs: Vec<&str>,
    scope: &str,
    status: &str,
    decision: Option<&str>,
) -> Skill {
    let version = SkillVersion {
        version: 1,
        content: skill_content(name).into(),
        summary: "初始版本".into(),
        at: "2026-11-01T03:00:00.000Z".into(),
        by: "zhangsan".into(),
        decision: decision.map(String::from),
        comment: if decision == Some("approved") {
            "内置技能，随工作台发布".into()
        } else {
            String::new()
        },
        reviewed_by: decision.map(|_| "zhangsan".to_string()),
        reviewed_at: decision.map(|_| "2026-11-01T03:10:00.000Z".to_string()),
    };
    Skill {
        id: format!("skill-{name}"),
        name: name.into(),
        description: description.into(),
        role_packs: role_packs.into_iter().map(String::from).collect(),
        scope: scope.into(),
        status: status.into(),
        owner_id: "zhangsan".into(),
        versions: vec![version],
        created_at: "2026-11-01T03:00:00.000Z".into(),
        updated_at: "2026-11-01T03:10:00.000Z".into(),
    }
}

pub fn skills() -> Vec<Skill> {
    let mut out = vec![
        seed_skill(
            "req-submit",
            "提交需求并进入待评审",
            vec!["product", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "req-review",
            "评审需求，支持多人会签",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "req-reviewers",
            "设置需求会签人",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "req-schedule",
            "给需求排期",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "req-scope",
            "调整需求本期范围",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "req-move",
            "需求跨迭代移动",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "iteration-plan",
            "迭代排期概览与逐条调整",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "iteration-edit",
            "迭代编辑、结束与归档",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "design-claim",
            "认领设计任务",
            vec!["design", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "design-start",
            "读取需求上下文并产出设计稿",
            vec!["design", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "design-deliver",
            "交付设计版本并标记晚到设计",
            vec!["design", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "dev-assign",
            "按平台指派开发负责人",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "dev-start",
            "开始开发并记录真实开始时间",
            vec!["dev", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "dev-finish",
            "完成开发并生成 MR / 流水线状态",
            vec!["dev", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "test-verify",
            "测试开始、通过与失败回退",
            vec!["qa", "lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
        seed_skill(
            "release-freeze",
            "测试通过后冻结与发布",
            vec!["lead", "admin"],
            "global",
            "active",
            Some("approved"),
        ),
    ];
    out.push(seed_skill(
        "req-acceptance",
        "需求验收清单（个人上传示例，等待负责人审核）",
        vec!["product"],
        "personal",
        "pending_review",
        None,
    ));
    out
}

pub fn notifications() -> Vec<(String, String, String, Option<String>, String, String, bool)> {
    // user_id, at, kind, requirement_id, title, body, read
    vec![
        (
            "zhangsan".into(),
            "2026-11-21T10:00:00.000Z".into(),
            "review_requested".into(),
            Some("req-seed-s12-001".into()),
            "S12-001 等待你评审".into(),
            "双十二会场：你已通过，仍有 1 位会签人待确认。".into(),
            false,
        ),
        (
            "admin".into(),
            "2026-11-21T10:00:00.000Z".into(),
            "review_requested".into(),
            Some("req-seed-s12-001".into()),
            "S12-001 等待你评审".into(),
            "双十二会场需要你完成会签。".into(),
            false,
        ),
        (
            "lisi".into(),
            "2026-11-22T02:04:00.000Z".into(),
            "test_failed".into(),
            Some("req-seed-003".into()),
            "S11-003 测试不通过".into(),
            "iOS 权益页切换账号后闪退；Android 积分明细为空。".into(),
            false,
        ),
        (
            "lisi".into(),
            "2026-11-21T09:10:00.000Z".into(),
            "design_updated".into(),
            Some("req-seed-001".into()),
            "S11-001 设计已更新".into(),
            "开发开始后设计有新版本，请同步研发查看。".into(),
            false,
        ),
        (
            "wangwu".into(),
            "2026-11-22T03:00:00.000Z".into(),
            "design_unclaimed".into(),
            Some("req-seed-004".into()),
            "S11-004 设计待认领".into(),
            "积分商城入口已排期，等待设计认领。".into(),
            false,
        ),
    ]
}

pub fn events_seed() -> Vec<(Option<String>, String, Option<String>, Option<String>, serde_json::Value)> {
    vec![
        (
            Some("lisi".into()),
            "requirement.submitted".into(),
            Some("req-seed-s12-001".into()),
            Some("iteration-2026-s12".into()),
            json!({"code": "S12-001", "version": 1}),
        ),
        (
            Some("zhangsan".into()),
            "requirement.reviewed".into(),
            Some("req-seed-s12-001".into()),
            Some("iteration-2026-s12".into()),
            json!({"decision": "approved", "waiting": 1}),
        ),
        (
            Some("qianqi".into()),
            "requirement.test_failed".into(),
            Some("req-seed-003".into()),
            Some("iteration-2026-s11".into()),
            json!({"note": "iOS 权益页切换账号后闪退"}),
        ),
    ]
}
