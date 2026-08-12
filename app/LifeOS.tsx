"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Profile = {
  display_name: string;
  vision: string;
  target_date: string;
  initialized: number;
  weekly_capacity_minutes: number;
  weekly_goal: string;
  side_hustle_limit_minutes: number;
  protected_day: string;
};

type Journey = {
  id: string;
  sequence_number: number;
  title: string;
  area: string;
  stage: string;
  acceptance_criteria: string;
  status: "active" | "planned" | "paused" | "completed";
  progress: number;
  next_action: string;
  evidence: string;
  completed_at: string | null;
  evidence_review_status: "" | "passed" | "needs_more";
  evidence_review_feedback: string;
  evidence_score: number;
};

type JourneyTask = { id:string;journey_id:string;title:string;acceptance_criteria:string;estimated_minutes:number;task_type:"reading"|"finance"|"exercise"|"english"|"general";execution_frequency:"weekly"|"monthly";priority:number;status:"pending"|"completed";source:"manual"|"ai";completed_at:string|null };

type Outcome = {
  id: string;
  title: string;
  acceptance_criteria: string;
  progress: number;
  expected_hours: number;
  journey_id: string;
  kind: "habit" | "milestone";
  period: string;
  status: "active" | "completed" | "rolled";
  settled_at: string | null;
  rolled_from_id: string;
};

type WeeklyCycle = { id:string;week_start:string;week_end:string;goal:string;capacity_minutes:number;status:"active"|"archived";completed_count:number;total_count:number;archived_at:string|null };

type Action = {
  id: string;
  outcome_id: string;
  title: string;
  estimated_minutes: number;
  scheduled_for: string;
  priority: number;
  status: "pending" | "completed" | "paused";
  task_type: "reading" | "finance" | "exercise" | "english" | "general";
  source: "seed" | "ai" | "manual" | "carried";
  is_side_hustle: number;
  cycle_id:string;
  carried_from_id:string;
  source_task_id:string;
};

type TaskOutput = { id: string; action_id: string; task_type: Action["task_type"]; title: string; content: string; duration: number; feeling: string; created_at: string };
type FinancialRecord = { id: string; action_id: string | null; category: "cash" | "fixed_asset" | "investment" | "property" | "income" | "fixed_expense" | "daily_expense" | "social_expense" | "exercise_expense" | "learning_expense"; amount: number; note: string; recorded_at: string; income_type: "" | "salary" | "non_salary"; source_name: string; expense_scope: "personal" | "business" };
type EnglishMessage = { id: string; role: "user" | "assistant"; text: string; feedback: string; created_at: string };
type Footprint = { id: string; name: string; status: "visited" | "wishlist"; content: string; visited_at: string | null; latitude: number | null; longitude: number | null; geometry_json: string | null; geometry_version: number; created_at: string; updated_at: string };
type FootprintImage = { id: string; footprint_id: string };

type Checkin = {
  id: string;
  type: "exercise" | "english" | "reading";
  duration: number;
  note: string;
  created_at: string;
};

type Review = {
  id: string;
  achievement: string;
  low_value: string;
  next_priority: string;
  health_check: string;
  market_evidence: string;
  energy_score: number;
  decision: "continue" | "adjust" | "stop";
  kill_rule_count: number;
  week_start:string;
  auto_decision:"continue"|"adjust"|"stop";
  auto_reasons:string;
  created_at: string;
};

type Workspace = {
  profile: Profile;
  journeys: Journey[];
  journeyTasks:JourneyTask[];
  outcomes: Outcome[];
  outcomeHistory:Outcome[];
  activeWeek:WeeklyCycle;
  weeklyCycles:WeeklyCycle[];
  actions: Action[];
  historyActions:Action[];
  checkins: Checkin[];
  reviews: Review[];
  taskOutputs: TaskOutput[];
  financialRecords: FinancialRecord[];
  englishMessages: EnglishMessage[];
  footprints: Footprint[];
  footprintImages: FootprintImage[];
  stopRuleEvents:Array<{id:string;week_start:string;rule_code:string;severity:"adjust"|"stop";reason:string;created_at:string}>;
};

type Tab = "today" | "vision" | "journeys" | "plan" | "records" | "finance" | "footprints" | "review";

const tabs: { key: Tab; label: string; mark: string }[] = [
  { key: "today", label: "今日", mark: "⌂" },
  { key: "vision", label: "40岁愿景", mark: "✦" },
  { key: "journeys", label: "征程", mark: "◎" },
  { key: "plan", label: "计划", mark: "◫" },
  { key: "records", label: "记录", mark: "+" },
  { key: "finance", label: "财务", mark: "¥" },
  { key: "footprints", label: "足迹", mark: "⌖" },
  { key: "review", label: "复盘", mark: "↗" },
];

const areaTone: Record<string, string> = {
  健康: "green",
  英语: "blue",
  职业: "amber",
  收入: "violet",
  财务与资产: "stone",
  关系与家庭: "rose",
  探索与生活: "sky",
};

const suShiQuotes = [
  { text: "人生如逆旅，我亦是行人。", source: "《临江仙·送钱穆父》" },
  { text: "竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。", source: "《定风波·莫听穿林打叶声》" },
  { text: "但愿人长久，千里共婵娟。", source: "《水调歌头·明月几时有》" },
  { text: "休对故人思故国，且将新火试新茶。诗酒趁年华。", source: "《望江南·超然台作》" },
  { text: "腹有诗书气自华。", source: "《和董传留别》" },
  { text: "回首向来萧瑟处，归去，也无风雨也无晴。", source: "《定风波·莫听穿林打叶声》" },
  { text: "一点浩然气，千里快哉风。", source: "《水调歌头·黄州快哉亭赠张偓佺》" },
];

function compactVision(vision: string) {
  const sentences = vision.split(/[。！？；;]+/).map((item) => item.trim()).filter(Boolean);
  const summary = (sentences.at(-1) || vision.trim()).replace(/^最重要的是[，,:：]?\s*/, "");
  if (!summary) return "在普通日子里，持续靠近自己想要的生活。";
  return `${summary.length > 34 ? `${summary.slice(0, 34)}…` : summary}${summary.length <= 34 && !/[。！？]$/.test(summary) ? "。" : ""}`;
}

export default function LifeOS() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkinType, setCheckinType] = useState<Checkin["type"] | null>(null);
  const [completingAction, setCompletingAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取工作台");
    setWorkspace((await response.json()) as Workspace);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/workspace", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("无法读取工作台");
        return response.json() as Promise<Workspace>;
      })
      .then((data) => {
        if (!active) return;
        setWorkspace(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setNotice("暂时无法连接数据，请刷新页面重试。");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function mutate(payload: Record<string, unknown>, success?: string) {
    setSaving(true);
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string;feedback?:string;score?:number };
      const messages:Record<string,string>={stage_locked:"前一阶段尚未通关，暂时不能激活这项征程。",evidence_required:"请先提交完成证据。",evidence_needs_more:`验收未通过（${result.score??0}分）：${result.feedback||"请补充可验证证据。"}`,month_outcomes_full:"本月已经有5项成果，请先完成或调整现有成果。",month_not_ready:"每月25日后开放月末结算，避免过早放弃本月成果。",month_settled:"本月已经结算，请到下月继续规划。",already_carried:"这项任务已经结转到本周。",no_journey_tasks:"当前没有可选的未完成征程子任务，请先在征程中创建。",no_tasks_fit_capacity:"没有子任务能放入当前时间容量，请调整可用时间或拆小任务。",generation_failed:"AI 暂时没有生成有效子任务，请稍后重试。",invalid_source_task:"请选择一个未完成的征程子任务。"};
      setNotice(result.error&&messages[result.error] ? messages[result.error] : "保存失败，请稍后重试。");
      if(result.error==="evidence_needs_more")await load();
      setSaving(false);
      return false;
    }
    await load();
    setSaving(false);
    if (success) {
      setNotice(success);
      window.setTimeout(() => setNotice(""), 2800);
    }
    return true;
  }

  if (loading) return <Loading />;
  if (!workspace) return <ErrorState />;
  if (!workspace.profile.initialized) {
    return <Onboarding workspace={workspace} busy={saving} onStart={() => mutate({ action: "initialize" })} />;
  }

  const completedActions = workspace.actions.filter((item) => item.status === "completed").length;
  const exerciseCount = workspace.checkins.filter((item) => item.type === "exercise").length;
  const englishCount = workspace.checkins.filter((item) => item.type === "english").length;
  const activeActions = workspace.actions.filter((item) => item.status !== "paused");
  const plannedMinutes = activeActions.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const completedMinutes = workspace.actions
    .filter((item) => item.status === "completed")
    .reduce((sum, item) => sum + item.estimated_minutes, 0);
  const visionTime = visionCountdown(workspace.profile.target_date);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="side-nav" aria-label="主导航">
          {tabs.map((item) => (
            <button key={item.key} className={tab === item.key ? "nav-item active" : "nav-item"} onClick={() => setTab(item.key)}>
              <span aria-hidden="true">{item.mark}</span>{item.label}
            </button>
          ))}
        </nav>
        <button type="button" className={tab === "vision" ? "vision-mini active" : "vision-mini"} onClick={() => setTab("vision")}>
          <span className="eyebrow">40岁愿景</span>
          <p>{compactVision(workspace.profile.vision)}</p>
          <div className="years-row"><span>还有 {visionTime.years} 年 {visionTime.months} 个月</span><i><b /></i></div>
        </button>
        <div className="user-row"><span className="avatar">文</span><span><strong>{workspace.profile.display_name}</strong><small>建立基线 · 第1阶段</small></span></div>
      </aside>

      <main className="main-content">
        {notice && <div className="toast" role="status">{notice}</div>}
        <MobileHeader />
        {tab === "today" && (
          <Today
            workspace={workspace}
            completedActions={completedActions}
            exerciseCount={exerciseCount}
            englishCount={englishCount}
            plannedMinutes={plannedMinutes}
            completedMinutes={completedMinutes}
            busy={saving}
            onToggle={(action) => action.status === "completed" ? mutate({ action: "toggle-action", id: action.id }, "已撤销完成") : setCompletingAction(action)}
            onCheckin={setCheckinType}
            onNavigate={setTab}
          />
        )}
        {tab === "vision" && <Vision profile={workspace.profile} journeys={workspace.journeys} actions={workspace.actions} busy={saving} mutate={mutate} />}
        {tab === "journeys" && <Journeys items={workspace.journeys} tasks={workspace.journeyTasks} busy={saving} mutate={mutate} />}
        {tab === "plan" && <Plan profile={workspace.profile} journeys={workspace.journeys} journeyTasks={workspace.journeyTasks} outcomes={workspace.outcomes} outcomeHistory={workspace.outcomeHistory} activeWeek={workspace.activeWeek} weeklyCycles={workspace.weeklyCycles} actions={workspace.actions} historyActions={workspace.historyActions} reviews={workspace.reviews} busy={saving} mutate={mutate} onComplete={setCompletingAction} />}
        {tab === "records" && <Records items={workspace.checkins} outputs={workspace.taskOutputs} messages={workspace.englishMessages} busy={saving} onCheckin={setCheckinType} mutate={mutate} />}
        {tab === "finance" && <Finance records={workspace.financialRecords} actions={workspace.actions} busy={saving} mutate={mutate} />}
        {tab === "footprints" && <Footprints items={workspace.footprints} images={workspace.footprintImages} onReload={load} />}
        {tab === "review" && (
          <ReviewPanel
            completedActions={completedActions}
            actionTotal={activeActions.length}
            exerciseCount={exerciseCount}
            englishCount={englishCount}
            reviews={workspace.reviews}
            busy={saving}
            mutate={mutate}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {tabs.map((item) => (
          <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            <span>{item.mark}</span>{item.label}
          </button>
        ))}
      </nav>

      {checkinType && (
        <CheckinDialog
          type={checkinType}
          busy={saving}
          onClose={() => setCheckinType(null)}
          onSubmit={async (duration, note) => {
            const ok = await mutate({ action: "checkin", type: checkinType, duration, note }, "记录好了，继续保持自己的节奏");
            if (ok) setCheckinType(null);
          }}
        />
      )}
      {completingAction && <TaskCompleteDialog action={completingAction} busy={saving} onClose={() => setCompletingAction(null)} onSubmit={async (values) => { const ok = await mutate({ action: "complete-task", id: completingAction.id, ...values }, "任务已完成，成果也记录好了"); if (ok) setCompletingAction(null); }} />}
    </div>
  );
}

function Brand() {
  return <div className="brand"><span className="brand-seed">W</span><span className="brand-copy"><strong>wen flow</strong><small>Build a life you love.</small></span></div>;
}

function visionCountdown(targetDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${targetDate}T00:00:00`);
  if (!Number.isFinite(target.getTime()) || target <= today) return { years: 0, months: 0, days: 0, totalDays: 0 };
  let years = target.getFullYear() - today.getFullYear();
  let months = target.getMonth() - today.getMonth();
  let days = target.getDate() - today.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(target.getFullYear(), target.getMonth(), 0).getDate();
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days, totalDays: Math.ceil((target.getTime() - today.getTime()) / 86_400_000) };
}

function Vision({ profile, journeys, actions, busy, mutate }: { profile: Profile; journeys: Journey[]; actions: Action[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const remaining = visionCountdown(profile.target_date);
  const completedJourneys = journeys.filter((item) => item.status === "completed");
  const completedActions = actions.filter((item) => item.status === "completed");
  const future = journeys.filter((item) => item.status !== "completed").sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.progress - a.progress));
  const targetLabel = new Date(`${profile.target_date}T00:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  return <>
    <PageHeader kicker="把愿景变成看得见的路" title="40岁愿景"><button className="primary-button" onClick={() => setEditing(true)}>编辑愿景</button></PageHeader>
    <section className="vision-hero-card">
      <span className="eyebrow">My North Star</span>
      <blockquote>{profile.vision}</blockquote>
      <div><span>目标日期</span><b>{targetLabel}</b></div>
    </section>
    <section className="vision-countdown" aria-label="距离愿景的时间">
      <div><b>{remaining.years}</b><span>年</span></div><i>·</i><div><b>{remaining.months}</b><span>个月</span></div><i>·</i><div><b>{remaining.days}</b><span>天</span></div>
      <p>距离愿景还有 <strong>{remaining.totalDays.toLocaleString("zh-CN")}</strong> 天。时间不是压力，是帮助你选择优先级的边界。</p>
    </section>
    <section className="vision-roadmap">
      <article className="vision-column completed">
        <div className="section-heading"><div><span className="eyebrow">Evidence</span><h3>已经完成的重要事项</h3></div><b className="vision-count">{completedJourneys.length || completedActions.length}</b></div>
        <div className="vision-items">{completedJourneys.length ? completedJourneys.map((item) => <div className="vision-item done" key={item.id}><span>✓</span><div><small>{item.area} · 第 {item.sequence_number} 次征程</small><b>{item.title}</b><p>{item.acceptance_criteria}</p></div></div>) : completedActions.length ? completedActions.slice(0, 8).map((item) => <div className="vision-item done" key={item.id}><span>✓</span><div><small>已完成行动</small><b>{item.title}</b><p>这一步已经成为通往愿景的真实证据。</p></div></div>) : <div className="empty-list"><b>第一项重要成果正在路上</b><p>完成一次征程后，它会沉淀在这里。</p></div>}</div>
      </article>
      <article className="vision-column future">
        <div className="section-heading"><div><span className="eyebrow">The Road Ahead</span><h3>未来要做的事情</h3></div><b className="vision-count">{future.length}</b></div>
        <div className="vision-items">{future.slice(0, 10).map((item) => <div className={`vision-item ${item.status}`} key={item.id}><span>{item.status === "active" ? "→" : item.sequence_number}</span><div><small>{item.status === "active" ? "正在推进" : "未来征程"} · {item.area}</small><b>{item.title}</b><p>{item.next_action}</p><i><b style={{ width: `${item.progress}%` }} /></i></div></div>)}</div>
      </article>
    </section>
    {editing && <VisionDialog profile={profile} busy={busy} onClose={() => setEditing(false)} onSave={async (vision, targetDate) => { const ok = await mutate({ action: "update-vision", vision, targetDate }, "愿景已更新"); if (ok) setEditing(false); }} />}
  </>;
}

function VisionDialog({ profile, busy, onClose, onSave }: { profile: Profile; busy: boolean; onClose: () => void; onSave: (vision: string, targetDate: string) => Promise<void> }) {
  const [vision, setVision] = useState(profile.vision);
  const [targetDate, setTargetDate] = useState(profile.target_date);
  async function submit(event: FormEvent) { event.preventDefault(); await onSave(vision, targetDate); }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="dialog vision-dialog" onSubmit={submit}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">40岁愿景</span><h2>编辑我的北极星</h2><p>写下你真正想抵达的生活，以及希望实现它的时间。</p><label><span>愿景详细信息</span><textarea required maxLength={2000} value={vision} onChange={(event) => setVision(event.target.value)} placeholder="40岁时，我希望……" /></label><label><span>目标日期</span><input required type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="soft-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy || !vision.trim()}>{busy ? "正在保存…" : "保存愿景"}</button></div></form></div>;
}

function MobileHeader() {
  return <header className="mobile-header"><Brand /><button aria-label="打开个人设置">文</button></header>;
}

function Loading() {
  return <div className="loading-screen"><span className="loading-brand">wen</span><p>正在整理今天最重要的事…</p></div>;
}

function ErrorState() {
  return <div className="loading-screen"><span className="loading-brand">wen</span><h1>工作台暂时没有准备好</h1><p>刷新页面后再试一次。</p></div>;
}

function Onboarding({ workspace, busy, onStart }: { workspace: Workspace; busy: boolean; onStart: () => void }) {
  return (
    <main className="onboarding">
      <Brand />
      <section className="onboarding-card">
        <span className="eyebrow">你的40岁愿景</span>
        <h1>从今天开始，把想要的生活<br />一点点变成日常。</h1>
        <blockquote>{workspace.profile.vision}</blockquote>
        <div className="setup-grid">
          <div><b>{workspace.journeys.filter((item)=>item.status==="active").length}</b><span>当前激活征程</span></div>
          <div><b>4</b><span>首月核心成果</span></div>
          <div><b>6.3h</b><span>本周成长安排</span></div>
        </div>
        <div className="gentle-note"><span>✓</span><p><strong>计划已按可持续容量准备好</strong><br />周五保留休息，所有 AI 建议都需要你确认。</p></div>
        <button className="primary-button" disabled={busy} onClick={onStart}>{busy ? "正在准备…" : "开始我的首月计划"}<span>→</span></button>
        <small className="privacy-copy">你的财务、健康和关系记录仅用于个人工作台。</small>
      </section>
    </main>
  );
}

function PageHeader({ title, kicker, children }: { title: string; kicker: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><p>{kicker}</p><h1>{title}</h1></div>{children}</header>;
}

function Today(props: {
  workspace: Workspace;
  completedActions: number;
  exerciseCount: number;
  englishCount: number;
  plannedMinutes: number;
  completedMinutes: number;
  busy: boolean;
  onToggle: (action: Action) => void;
  onCheckin: (type: "exercise" | "english") => void;
  onNavigate: (tab: Tab) => void;
}) {
  const pending = props.workspace.actions.find((item) => item.status === "pending");
  const activeActionCount = props.workspace.actions.filter((item) => item.status !== "paused").length;
  const percentage = Math.round((props.completedActions / Math.max(activeActionCount, 1)) * 100);
  const today = new Date();
  const dayKey = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  const quote = suShiQuotes[Math.abs(dayKey) % suShiQuotes.length];
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(today);
  return (
    <>
      <header className="page-header poetry-header"><div><p>{dateLabel}</p><h1>“{quote.text}”</h1><small>—— 苏轼 {quote.source}</small></div>
        <div className="stage-chip"><span />建立基线 · 第1周</div>
      </header>
      <section className="hero-grid">
        <article className="focus-card">
          <div className="card-topline"><span>今日最重要行动</span><i>高贡献</i></div>
          {pending ? <>
            <h2>{pending.title}</h2>
            <p className="focus-meta"><span>◷ {pending.estimated_minutes}分钟</span><span>·</span><span>对应首月成果</span></p>
            <div className="focus-reason"><b>为什么是它</b><p>这是建立职业与财务基线的关键输入，完成后能减少后续计划中的不确定性。</p></div>
            <div className="action-row"><button className="primary-button" disabled={props.busy} onClick={() => props.onToggle(pending)}>✓ 完成行动</button><button className="soft-button" onClick={() => props.onNavigate("plan")}>调整今天</button></div>
          </> : <div className="empty-focus"><h2>今天的重点已经完成</h2><p>剩下的时间留给恢复或喜欢的生活。</p></div>}
        </article>
        <article className="week-card">
          <div className="section-heading"><div><span className="eyebrow">本周状态</span><h3>节奏刚刚好</h3></div><span className="capacity-badge">未过载</span></div>
          <div className="ring-row"><div className="progress-ring" style={{ "--progress": `${percentage * 3.6}deg` } as React.CSSProperties}><span><b>{percentage}%</b><small>已完成</small></span></div><div className="week-stats"><p><b>{props.completedActions}/{activeActionCount}</b><span>重点行动</span></p><p><b>{Math.round(props.completedMinutes / 60 * 10) / 10}h</b><span>已投入 / {Math.round(props.plannedMinutes / 60 * 10) / 10}h</span></p></div></div>
          <div className="balance-row"><span><i className="dot green" />运动 <b>{props.exerciseCount}/3</b></span><span><i className="dot blue" />英语 <b>{props.englishCount}/3</b></span><span><i className="dot sand" />恢复 <b>良好</b></span></div>
        </article>
      </section>

      <section className="quick-section">
        <div className="section-heading"><div><span className="eyebrow">快速记录</span><h3>今天为自己做了什么？</h3></div><small>10秒完成记录</small></div>
        <div className="quick-grid">
          <button className="quick-card exercise" onClick={() => props.onCheckin("exercise")}><span className="quick-icon">↗</span><span><b>记录运动</b><small>力量、有氧或喜欢的运动</small></span><i>＋</i></button>
          <button className="quick-card english" onClick={() => props.onCheckin("english")}><span className="quick-icon">Aa</span><span><b>记录英语</b><small>口语、课程或真实使用</small></span><i>＋</i></button>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading"><div><span className="eyebrow">正在推进</span><h3>本月四个核心成果</h3></div><button className="text-button" onClick={() => props.onNavigate("plan")}>查看完整计划 →</button></div>
        <div className="outcome-grid">
          {props.workspace.outcomes.map((item, index) => <OutcomeCard key={item.id} item={item} index={index} />)}
        </div>
      </section>

      <section className="ai-note">
        <span className="ai-mark">✦</span><div><span className="eyebrow">基于你的实际容量</span><p>本周计划约 {Math.round(props.plannedMinutes / 6) / 10} 小时，可用时间为 {Math.round(props.workspace.profile.weekly_capacity_minutes / 6) / 10} 小时。目标：{props.workspace.profile.weekly_goal || "先完成当前最重要的行动"}</p></div><button aria-label="查看建议详情">→</button>
      </section>
    </>
  );
}

function OutcomeCard({ item, index, onEdit }: { item: Outcome; index: number; onEdit?: (item: Outcome) => void }) {
  const tones = ["stone", "green", "blue", "amber"];
  const tone = tones[index % tones.length];
  const label = /财务|资产|收入|支出/.test(item.title) ? "财务" : /运动|健康|身体/.test(item.title) ? "健康" : /英语|英文|口语/.test(item.title) ? "英语" : /职业|项目|工作|能力/.test(item.title) ? "职业" : `成果 ${index + 1}`;
  return <article className="outcome-card"><div className="outcome-head"><span className={`area-pill ${tone}`}>{item.kind === "habit" ? `${label} · 习惯` : label}</span><div><b>{item.progress}%</b>{onEdit && <button type="button" className="card-edit" onClick={() => onEdit(item)}>编辑</button>}</div></div><h4>{item.title}</h4><p>{item.acceptance_criteria}</p><div className="progress-bar"><i className={tone} style={{ width: `${item.progress}%` }} /></div></article>;
}

function Journeys({ items, tasks, busy, mutate }: { items: Journey[];tasks:JourneyTask[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [filter, setFilter] = useState("全部");
  const stages = [...new Set(items.map((item) => item.stage))];
  const currentStage = items.find((item) => item.status === "active")?.stage ?? stages[0] ?? "";
  const [stageFilter, setStageFilter] = useState("当前阶段");
  const [editing, setEditing] = useState<Journey | null>(null);
  const [completing, setCompleting] = useState<Journey | null>(null);
  const [creating, setCreating] = useState(false);
  const [taskJourney,setTaskJourney]=useState<Journey|null>(null);
  const [editingTask,setEditingTask]=useState<JourneyTask|null>(null);
  const [evaluation,setEvaluation]=useState<{journeyId:string;score:number;summary:string;strengths:string[];issues:string[];suggestions:string[]}|null>(null);
  const [evaluating,setEvaluating]=useState("");
  const areas = ["全部", "健康", "英语", "职业", "财务与资产", "收入", "关系与家庭", "探索与生活"];
  const stageItems = stageFilter === "全部阶段" ? items : items.filter((item) => item.stage === (stageFilter === "当前阶段" ? currentStage : stageFilter));
  const visible = filter === "全部" ? stageItems : stageItems.filter((item) => item.area === filter);
  const activeCount = items.filter((item) => item.status === "active").length;
  const stageCompleted = items.filter((item) => item.stage === currentStage && item.status === "completed").length;
  const stageTotal = items.filter((item) => item.stage === currentStage).length;
  return <>
    <PageHeader kicker="32岁—40岁" title="100次征程"><div className="action-row"><div className="stage-chip"><span />当前激活 {activeCount}</div><button className="primary-button" onClick={() => setCreating(true)}>＋ 添加征程</button></div></PageHeader>
    <div className="journey-stage-bar"><div><span className="eyebrow">当前阶段</span><b>{currentStage}</b><small>{stageCompleted}/{stageTotal} 已完成 · 完成本阶段后自动解锁下一阶段</small></div><select value={stageFilter} onChange={(event)=>setStageFilter(event.target.value)}><option>当前阶段</option><option>全部阶段</option>{stages.map((stage)=><option key={stage}>{stage}</option>)}</select></div>
    <div className="filter-row">{areas.map((area) => <button key={area} className={filter === area ? "active" : ""} onClick={() => setFilter(area)}>{area}</button>)}</div>
    <section className="journey-list">
      {visible.map((item) => {const childTasks=tasks.filter((task)=>task.journey_id===item.id),completed=childTasks.filter((task)=>task.status==="completed").length;return <article key={item.id} className="journey-row journey-with-tasks">
        <div className="journey-number">{String(item.sequence_number).padStart(2, "0")}</div>
        <div className="journey-copy"><div><span className={`area-pill ${areaTone[item.area] ?? "stone"}`}>{item.area}</span><span className={`status-text ${item.status}`}>{statusLabel(item.status)}</span>{childTasks.length>0&&<span className="task-count-chip">{completed}/{childTasks.length} 子任务</span>}</div><h3>{item.title}</h3><p>{item.acceptance_criteria}</p>{item.status === "active" && <small>下一步：{item.next_action}</small>}
          <div className="journey-task-toolbar"><button className="soft-button" disabled={busy} onClick={()=>setTaskJourney(item)}>＋ 子任务</button><button className="soft-button" disabled={busy} onClick={()=>mutate({action:"generate-journey-tasks",journeyId:item.id},"AI 已补充征程子任务")}>✦ AI 自动生成</button><button className="soft-button" disabled={busy||!childTasks.length||evaluating===item.id} onClick={async()=>{setEvaluating(item.id);const response=await fetch("/api/workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"evaluate-journey-tasks",journeyId:item.id})});const data=await response.json() as {evaluation?:Omit<NonNullable<typeof evaluation>,"journeyId">};if(response.ok&&data.evaluation)setEvaluation({journeyId:item.id,...data.evaluation});setEvaluating("");}}>{evaluating===item.id?"评估中…":"✦ AI 评估合理性"}</button></div>
          {childTasks.length?<div className="journey-task-list">{childTasks.map((task)=><div className={`journey-task-item ${task.status}`} key={task.id}><input type="checkbox" checked={task.status==="completed"} disabled={busy} aria-label={`${task.title}完成状态`} onChange={()=>mutate({action:"toggle-journey-task",id:task.id},task.status==="completed"?"子任务已恢复":"子任务已完成")} /><button className="journey-task-copy" onClick={()=>setEditingTask(task)}><span className="journey-task-title"><b>{task.title}</b><i className={`frequency-chip ${task.execution_frequency}`}>{task.execution_frequency==="weekly"?"周任务":"月任务"}</i></span><small>{task.acceptance_criteria} · 单次 {task.estimated_minutes}分钟{task.source==="ai"?" · AI生成":""}</small></button></div>)}</div>:<div className="journey-task-empty">先创建子任务并配置为周任务或月任务，AI 会据此生成月计划和周计划。</div>}
          {evaluation?.journeyId===item.id&&<div className="task-evaluation"><header><b>AI 合理性评分 {evaluation.score}</b><button onClick={()=>setEvaluation(null)}>×</button></header><p>{evaluation.summary}</p>{evaluation.strengths.length>0&&<small>做得好：{evaluation.strengths.join("；")}</small>}{evaluation.issues.length>0&&<small>需要调整：{evaluation.issues.join("；")}</small>}{evaluation.suggestions.length>0&&<small>建议：{evaluation.suggestions.join("；")}</small>}</div>}
        </div>
        <div className="journey-action"><div className="journey-menu"><button onClick={() => setEditing(item)}>编辑</button>{item.status === "active" ? <><button disabled={busy} onClick={() => setCompleting(item)}>完成</button><button disabled={busy} onClick={() => mutate({ action: "journey-status", id: item.id, status: "paused" }, "征程已暂停，这不代表失败")}>暂停</button></> : item.status !== "completed" ? <button disabled={busy} onClick={() => mutate({ action: "journey-status", id: item.id, status: "active" }, "已加入当前阶段")}>激活</button> : null}</div>{item.status !== "planned" && <b>{item.progress}%</b>}</div>
      </article>})}
    </section>
    {editing && <JourneyDialog journey={editing} busy={busy} onClose={() => setEditing(null)} onSave={async (values) => { const ok = await mutate({ action: "update-journey", id: editing.id, ...values }, "征程内容已更新"); if (ok) setEditing(null); }} onDelete={async () => { const ok = await mutate({ action: "delete-journey", id: editing.id }, "征程已删除"); if (ok) setEditing(null); }} />}
    {creating && <JourneyCreateDialog busy={busy} onClose={() => setCreating(false)} onSave={async (values) => { const ok = await mutate({ action: "add-journey", ...values }, "新的征程已加入路线"); if (ok) setCreating(false); }} />}
    {completing && <JourneyCompleteDialog journey={completing} busy={busy} onClose={() => setCompleting(null)} onSubmit={async (evidence) => { const ok = await mutate({action:"complete-journey",id:completing.id,evidence},"征程已完成，系统已检查下一项解锁条件"); if(ok)setCompleting(null); }} />}
    {(taskJourney||editingTask)&&<JourneyTaskDialog
      journey={taskJourney||items.find((item)=>item.id===editingTask?.journey_id)!}
      item={editingTask||undefined}
      busy={busy}
      onClose={()=>{setTaskJourney(null);setEditingTask(null);}}
      onSave={async(values)=>{const journeyId=taskJourney?.id||editingTask?.journey_id;const ok=await mutate({action:editingTask?"update-journey-task":"add-journey-task",id:editingTask?.id,journeyId,...values},editingTask?"子任务已更新":"子任务已创建");if(ok){setTaskJourney(null);setEditingTask(null);}}}
      onDelete={editingTask?async()=>{const ok=await mutate({action:"delete-journey-task",id:editingTask.id},"子任务已删除");if(ok)setEditingTask(null);}:undefined}
    />}
  </>;
}

function statusLabel(status: Journey["status"]) {
  return { active: "进行中", planned: "待开始", paused: "已暂停", completed: "已完成" }[status];
}

function Plan({ profile, journeys, journeyTasks, outcomes, outcomeHistory, activeWeek, weeklyCycles, actions, historyActions, reviews, busy, mutate, onComplete }: { profile: Profile; journeys: Journey[];journeyTasks:JourneyTask[]; outcomes: Outcome[]; outcomeHistory:Outcome[];activeWeek:WeeklyCycle;weeklyCycles:WeeklyCycle[];actions: Action[];historyActions:Action[]; reviews: Review[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean>; onComplete: (action: Action) => void }) {
  const [adjusting, setAdjusting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [creatingOutcome, setCreatingOutcome] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState<Outcome | null>(null);
  const [creatingAction, setCreatingAction] = useState(false);
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [showHistory,setShowHistory]=useState(false);
  const [confirmSettlement,setConfirmSettlement]=useState(false);
  const activeActions = actions.filter((item) => item.status !== "paused");
  const weeklyMinutes = activeActions.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const weeklyHours = Math.round(weeklyMinutes / 6) / 10;
  const sideHustleMinutes = activeActions.filter((item)=>item.is_side_hustle).reduce((sum,item)=>sum+item.estimated_minutes,0);
  const latestReview = reviews[0];
  return <>
    <PageHeader kicker={`${activeWeek?.week_start||"本周"} — ${activeWeek?.week_end||""}`} title="本周计划"><div className="action-row"><button className="soft-button" onClick={()=>setShowHistory(!showHistory)}>{showHistory?"返回本周":"历史周计划"}</button><button className="soft-button" onClick={() => setSettings(true)}>配置时间与目标</button><button className="soft-button" onClick={() => setAdjusting(true)}>帮我调整计划</button></div></PageHeader>
    {showHistory&&<ExecutionHistory cycles={weeklyCycles.filter((cycle)=>cycle.status==="archived")} actions={historyActions} outcomes={outcomeHistory} busy={busy} mutate={mutate} />}
    {!showHistory&&<>
    <section className="week-goal-card"><div><span className="eyebrow">本周目标</span><h3>{profile.weekly_goal || "还没有填写本周目标"}</h3><p>AI 只从未完成的征程子任务中挑选，并保留约 15% 时间余量；{profile.protected_day}不安排任务。</p></div><div><b>{Math.round(profile.weekly_capacity_minutes / 6) / 10}h</b><small>本周可用</small></div><button className="primary-button" disabled={busy} onClick={() => mutate({ action: "generate-week-plan" }, "已从征程子任务中选出本周计划")}>{busy ? "筛选中…" : "✦ AI 选取本周任务"}</button></section>
    {(weeklyMinutes>profile.weekly_capacity_minutes||sideHustleMinutes>profile.side_hustle_limit_minutes||latestReview?.auto_decision==="stop"||latestReview?.auto_decision==="adjust"||latestReview?.energy_score<=4)&&<div className="guardrail-alert"><b>计划护栏已触发</b><span>{weeklyMinutes>profile.weekly_capacity_minutes?`当前安排超过可用时间 ${Math.round((weeklyMinutes-profile.weekly_capacity_minutes)/6)/10}h，建议重新生成或暂缓低优先级任务。`:sideHustleMinutes>profile.side_hustle_limit_minutes?"副业投入超过设定上限。":latestReview?.auto_decision==="stop"?"自动停止规则已触发，本周不会生成副业任务。":latestReview?.auto_decision==="adjust"?"自动规则建议降低负载或先验证市场证据。":"最近能量偏低，AI计划将自动减量。"}</span></div>}
    <div className="plan-summary"><div><span>核心成果</span><b>{outcomes.length}</b><small>保持少而重要</small></div><div><span>预计投入</span><b>{outcomes.reduce((sum, item) => sum + item.expected_hours, 0)}h</b><small>由你配置本月容量</small></div><div><span>明确不做</span><b>3</b><small>课程、社群、重型副业</small></div></div>
    <section className="plan-layout">
      <div><div className="section-heading"><div><span className="eyebrow">月度成果 · {outcomes[0]?.period||new Date().toISOString().slice(0,7)}</span><h3>从征程子任务中选取本月重点</h3></div><div className="monthly-actions"><button className="soft-button" disabled={busy} onClick={()=>mutate({action:"generate-month-outcomes"},"已从征程子任务中补充本月成果")}>✦ 从子任务规划本月</button><button className={confirmSettlement?"danger-button confirm":"soft-button"} disabled={busy} onClick={()=>confirmSettlement?mutate({action:"settle-month"},"本月已结算，未完成成果已滚动到下月").then((ok)=>{if(ok)setConfirmSettlement(false);}):setConfirmSettlement(true)}>{confirmSettlement?"确认结算并滚动":"月末结算"}</button><button className="soft-button" onClick={() => setCreatingOutcome(true)}>＋ 新增成果</button></div></div><div className="plan-outcomes">{outcomes.map((item, index) => <OutcomeCard item={item} index={index} key={item.id} onEdit={item.status==="active"?setEditingOutcome:undefined} />)}{outcomes.length === 0 && <div className="empty-list"><b>还没有月度成果</b><p>先在征程中创建子任务，再从中选择本月重点。</p></div>}</div></div>
      <div className="weekly-panel"><div className="section-heading"><div><span className="eyebrow">本周重点</span><h3>{actions.filter((item) => item.status === "completed").length}/{activeActions.length} 已完成</h3></div><div className="weekly-heading-actions"><span className="capacity-badge">{weeklyHours}h / {Math.round(profile.weekly_capacity_minutes / 6) / 10}h</span><button className="soft-button" onClick={() => setCreatingAction(true)}>＋ 新增任务</button></div></div>{actions.map((item) => <div key={item.id} className={`task-row ${item.status}`}><input aria-label={`${item.title}完成状态`} type="checkbox" checked={item.status === "completed"} disabled={busy || item.status === "paused"} onChange={() => item.status === "completed" ? mutate({ action: "toggle-action", id: item.id }, "已撤销完成") : onComplete(item)} /><span><b>{item.title}</b><small><i className={`task-type ${item.task_type}`}>{taskTypeLabel(item.task_type)}</i>{item.status === "paused" ? "本周暂缓" : `${item.scheduled_for} · ${item.estimated_minutes}分钟`}{item.source === "ai" ? " · AI生成" : item.source === "manual" ? " · 手动添加" : ""}</small></span><button type="button" className="task-edit" onClick={() => setEditingAction(item)}>编辑</button></div>)}</div>
    </section>
    </>}
    {adjusting && <AdjustPlanDialog actions={actions} busy={busy} onClose={() => setAdjusting(false)} onAdjust={async (mode, message) => { const ok = await mutate({ action: "adjust-plan", mode }, message); if (ok) setAdjusting(false); }} />}
    {settings && <WeeklySettingsDialog profile={profile} busy={busy} onClose={() => setSettings(false)} onSave={async (capacityMinutes, goal, sideHustleLimitMinutes, protectedDay, generate) => { const ok = await mutate({ action: generate ? "generate-week-plan" : "weekly-settings", capacityMinutes, goal, sideHustleLimitMinutes, protectedDay }, generate ? "已按本周目标与生活护栏生成新计划" : "本周容量、目标与护栏已保存"); if (ok) setSettings(false); }} />}
    {(creatingOutcome || editingOutcome) && <OutcomeDialog item={editingOutcome ?? undefined} journeys={journeys} busy={busy} onClose={() => { setCreatingOutcome(false); setEditingOutcome(null); }} onSave={async (values) => { const ok = await mutate({ action: editingOutcome ? "update-outcome" : "add-outcome", id: editingOutcome?.id, ...values }, editingOutcome ? "月度成果已更新" : "月度成果已添加"); if (ok) { setCreatingOutcome(false); setEditingOutcome(null); } }} onDelete={editingOutcome ? async () => { const ok = await mutate({ action: "delete-outcome", id: editingOutcome.id }, "月度成果已删除，相关周任务已保留"); if (ok) setEditingOutcome(null); } : undefined} />}
    {(creatingAction || editingAction) && <WeeklyActionDialog item={editingAction ?? undefined} outcomes={outcomes} journeyTasks={journeyTasks} journeys={journeys} busy={busy} onClose={() => { setCreatingAction(false); setEditingAction(null); }} onSave={async (values) => { const ok = await mutate({ action: editingAction ? "update-weekly-action" : "add-weekly-action", id: editingAction?.id, ...values }, editingAction ? "周任务已更新" : "周任务已从征程加入本周"); if (ok) { setCreatingAction(false); setEditingAction(null); } }} onDelete={editingAction ? async () => { const ok = await mutate({ action: "delete-weekly-action", id: editingAction.id }, "周任务已删除，征程子任务仍会保留"); if (ok) setEditingAction(null); } : undefined} />}
  </>;
}

function ExecutionHistory({cycles,actions,outcomes,busy,mutate}:{cycles:WeeklyCycle[];actions:Action[];outcomes:Outcome[];busy:boolean;mutate:(payload:Record<string,unknown>,success?:string)=>Promise<boolean>}){
  const months=[...new Set(outcomes.map((item)=>item.period))];
  return <div className="execution-history"><section><div className="section-heading"><div><span className="eyebrow">周计划归档</span><h3>过去的计划不会再混入本周</h3></div></div>{cycles.length?cycles.map((cycle)=>{const rows=actions.filter((item)=>item.cycle_id===cycle.id);return <article className="history-cycle" key={cycle.id}><header><div><b>{cycle.week_start} — {cycle.week_end}</b><small>{cycle.goal||"未填写周目标"}</small></div><span>{cycle.completed_count}/{cycle.total_count} 完成</span></header><div>{rows.length?rows.map((item)=><div className="history-action" key={item.id}><span><b>{item.title}</b><small>{item.status==="completed"?"已完成":item.status==="paused"?"已暂缓":"未完成"} · {item.estimated_minutes}分钟</small></span>{item.status!=="completed"&&<button disabled={busy} onClick={()=>mutate({action:"carry-action",id:item.id},"任务已结转到本周")}>结转到本周</button>}</div>):<p>该周没有任务。</p>}</div></article>}):<div className="empty-list"><b>还没有历史周计划</b><p>进入下一自然周后，本周计划会自动归档。</p></div>}</section><section><div className="section-heading"><div><span className="eyebrow">月度成果历史</span><h3>结算结果与滚动来源</h3></div></div>{months.length?months.map((month)=><article className="history-month" key={month}><b>{month}</b><div>{outcomes.filter((item)=>item.period===month).map((item)=><span key={item.id}>{item.status==="completed"?"✓":"↗"} {item.title} · {item.progress}%</span>)}</div></article>):<div className="empty-list"><b>还没有月度归档</b><p>月末结算后会在这里保留成果历史。</p></div>}</section></div>;
}

function taskTypeLabel(type: Action["task_type"]) { return { reading: "阅读", finance: "财务", exercise: "运动", english: "英语", general: "通用" }[type]; }

function Records({ items, outputs, messages, busy, onCheckin, mutate }: { items: Checkin[]; outputs: TaskOutput[]; messages: EnglishMessage[]; busy: boolean; onCheckin: (type: Checkin["type"]) => void; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  return <>
    <PageHeader kicker="行动留下痕迹" title="记录"><div className="action-row"><button className="soft-button" onClick={() => onCheckin("reading")}>＋ 读书</button><button className="soft-button" onClick={() => onCheckin("exercise")}>＋ 运动</button><button className="soft-button" onClick={() => onCheckin("english")}>＋ 英语</button></div></PageHeader>
    <div className="record-summary"><article><span className="quick-icon reading">书</span><div><small>本月读书</small><b>{items.filter((item) => item.type === "reading").length} <em>篇笔记</em></b></div></article><article><span className="quick-icon exercise">↗</span><div><small>本月运动</small><b>{items.filter((item) => item.type === "exercise").length} <em>/ 12次</em></b></div></article><article><span className="quick-icon english">Aa</span><div><small>本月英语</small><b>{items.filter((item) => item.type === "english").length} <em>/ 12次</em></b></div></article><article><span className="quick-icon finance">¥</span><div><small>财务基线</small><b>25% <em>已完成</em></b></div></article></div>
    <section className="record-list"><div className="section-heading"><div><span className="eyebrow">最近记录</span><h3>每一次行动都在形成证据</h3></div></div>{items.length ? items.map((item) => <article key={item.id}><span className={`record-mark ${item.type}`}>{item.type === "exercise" ? "↗" : item.type === "reading" ? "书" : "Aa"}</span><div><b>{item.type === "exercise" ? "完成一次运动" : item.type === "reading" ? "提交一篇读书笔记" : "提交一篇英语学习笔记"}</b><p>{item.note || "只记录完成，不给今天增加负担"}</p></div><span><b>{item.duration}分钟</b><small>{new Date(item.created_at).toLocaleDateString("zh-CN")}</small></span></article>) : <div className="empty-list"><b>还没有记录</b><p>今天完成后，留下第一条行动证据。</p></div>}</section>
    <TaskOutputList outputs={outputs} />
    <EnglishCoach messages={messages} busy={busy} mutate={mutate} />
  </>;
}

function TaskOutputList({ outputs }: { outputs: TaskOutput[] }) {
  if (!outputs.length) return null;
  return <section className="record-list output-list"><div className="section-heading"><div><span className="eyebrow">任务成果</span><h3>完成不只是打勾</h3></div></div>{outputs.slice(0, 12).map((item) => <article key={item.id}><span className={`record-mark ${item.task_type}`}>{item.task_type === "reading" ? "书" : item.task_type === "finance" ? "¥" : item.task_type === "exercise" ? "↗" : item.task_type === "english" ? "Aa" : "✓"}</span><div><b>{item.title}</b><p>{item.content || item.feeling || "已记录完成成果"}</p></div><span><b>{taskTypeLabel(item.task_type)}</b><small>{new Date(item.created_at).toLocaleDateString("zh-CN")}</small></span></article>)}</section>;
}

function EnglishCoach({ messages, busy, mutate }: { messages: EnglishMessage[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const latestReply = [...messages].reverse().find((item) => item.role === "assistant");
  function speak(text: string) { if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }
  function listen() {
    const Speech = (window as unknown as { SpeechRecognition?: new () => { lang: string; start: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void }; webkitSpeechRecognition?: new () => { lang: string; start: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void } }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; start: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void } }).webkitSpeechRecognition;
    if (!Speech) { setMessage("My browser does not support speech recognition, so I am typing instead."); return; }
    const recognition = new Speech(); recognition.lang = "en-US"; recognition.onresult = (event) => setMessage(event.results[0][0].transcript); recognition.onend = () => setListening(false); setListening(true); recognition.start();
  }
  async function submit(event: FormEvent) { event.preventDefault(); if (!message.trim()) return; const ok = await mutate({ action: "english-coach", message }, "Coach 已给出反馈"); if (ok) setMessage(""); }
  return <section className="english-coach"><div className="section-heading"><div><span className="eyebrow">English Coach</span><h3>对话、纠正与口语训练</h3></div>{latestReply && <button className="soft-button" onClick={() => speak(latestReply.text)}>▶ 播放回复</button>}</div><div className="chat-log">{messages.length ? messages.slice(-8).map((item) => <div key={item.id} className={`chat-bubble ${item.role}`}><b>{item.role === "user" ? "You" : "Coach"}</b><p>{item.text}</p>{item.feedback && <small>{item.feedback}</small>}</div>) : <div className="empty-list"><b>Start with one sentence.</b><p>Try: “This week, I want to…”</p></div>}</div><form className="coach-input" onSubmit={submit}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="用英语输入，或点击麦克风开始口语…" /><div><button type="button" className="soft-button" onClick={listen}>{listening ? "正在聆听…" : "◉ 开始口语"}</button><button className="primary-button" disabled={busy || !message.trim()}>发送给 Coach</button></div></form></section>;
}

function OpenStreetFootprintMap({ items, selectedId, onSelect, onEdit }: { items: Footprint[]; selectedId: string; onSelect: (id: string) => void; onEdit: (item: Footprint) => void }) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    void import("leaflet").then((L) => {
      if (cancelled) return;
      map = L.map(element, { zoomControl: true, zoomSnap: 0.1, zoomDelta: 0.5 }).setView([28, 105], 3);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      const selectedBounds = L.latLngBounds([]);
      let selectedLayer: import("leaflet").Layer | undefined;
      items.forEach((item) => {
        if (item.latitude === null || item.longitude === null) return;
        const selected = item.id === selectedId;
        const visited = item.status === "visited";
        const style: import("leaflet").PathOptions = {
          color: visited ? (selected ? "#ff5a00" : "#ffad00") : (selected ? "#2d72ff" : "#7d918a"),
          weight: selected ? 5 : visited ? 3 : 2,
          fillColor: visited ? (selected ? "#ff6a00" : "#ffd43b") : "#9cadb3",
          fillOpacity: visited ? (selected ? 0.72 : 0.42) : (selected ? 0.24 : 0.08),
          opacity: selected ? 1 : 0.9,
          dashArray: visited ? undefined : "7 7",
        };
        let layer: import("leaflet").Layer;
        if (item.geometry_json) {
          try {
            const geometry = JSON.parse(item.geometry_json) as GeoJSON.GeoJsonObject;
            layer = L.geoJSON(geometry, {
              style,
              pointToLayer: (_feature, latlng) => L.circle(latlng, { ...style, radius: selected ? 38000 : 26000 }),
            });
          } catch {
            layer = L.circle([item.latitude, item.longitude], { ...style, radius: selected ? 38000 : 26000 });
          }
        } else {
          layer = L.circle([item.latitude, item.longitude], { ...style, radius: selected ? 38000 : 26000 });
        }
        layer.addTo(map!);
        layer.bindTooltip(`${visited ? "已去过" : "想去"} · ${item.name}`, { sticky: true });
        const popup = document.createElement("article");
        popup.className = "footprint-popup-card";
        const meta = document.createElement("small");
        meta.textContent = `${visited ? "已去过" : "未来想去"}${item.visited_at ? ` · ${new Date(item.visited_at).toLocaleDateString("zh-CN")}` : ""}`;
        const title = document.createElement("b");
        title.textContent = item.name;
        const content = document.createElement("p");
        content.textContent = item.content || "还没有写下这里的故事。";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "编辑足迹";
        edit.addEventListener("click", () => onEdit(item));
        popup.append(meta, title, content, edit);
        layer.bindPopup(popup, { autoPan: false, className: "footprint-map-popup", maxWidth: 290 });
        layer.on("click", () => onSelect(item.id));
        const layerBounds = "getBounds" in layer ? (layer as import("leaflet").FeatureGroup | import("leaflet").Circle).getBounds() : L.latLngBounds([[item.latitude, item.longitude]]);
        bounds.extend(layerBounds);
        if (selected) {
          selectedLayer = layer;
          selectedBounds.extend(layerBounds);
        }
      });

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
      if (selectedBounds.isValid()) {
        window.requestAnimationFrame(() => {
          map?.invalidateSize();
          map?.fitBounds(selectedBounds, { padding: [8, 8], maxZoom: 18, animate: false });
          selectedLayer?.openPopup();
        });
      }
    });

    return () => { cancelled = true; map?.remove(); };
  }, [items, onEdit, onSelect, selectedId]);

  return <div ref={elementRef} className="footprint-map" aria-label="OpenStreetMap 足迹地图" />;
}

function Footprints({ items, images, onReload }: { items: Footprint[]; images: FootprintImage[]; onReload: () => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | "visited" | "wishlist">("all");
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<Footprint | "new" | null>(null);
  const [geocoding, setGeocoding] = useState("");
  const attemptedGeocodes = useRef(new Set<string>());
  const visible = filter === "all" ? items : items.filter((item) => item.status === filter);
  const selected = items.find((item) => item.id === selectedId) ?? visible[0] ?? items[0];
  const selectedImages = selected ? images.filter((image) => image.footprint_id === selected.id) : [];
  const visitedCount = items.filter((item) => item.status === "visited").length;
  const wishlistCount = items.filter((item) => item.status === "wishlist").length;
  useEffect(() => {
    const needsGeocoding = (item: Footprint) => (item.latitude === null || item.geometry_version < 3) && !attemptedGeocodes.current.has(item.id);
    const missing = items.find((item) => item.id === selectedId && needsGeocoding(item)) ?? items.find(needsGeocoding);
    if (!missing || geocoding) return;
    attemptedGeocodes.current.add(missing.id);
    setGeocoding(missing.id);
    void fetch("/api/footprint-geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: missing.id }) })
      .then((response) => response.ok ? onReload() : undefined)
      .finally(() => window.setTimeout(() => setGeocoding(""), 1100));
  }, [geocoding, items, onReload, selectedId]);
  return <>
    <PageHeader kicker="把世界变成生活的证据" title="我的足迹"><button className="primary-button" onClick={() => setEditing("new")}>＋ 留下足迹</button></PageHeader>
    <div className="footprint-summary"><div><b>{visitedCount}</b><span>已点亮</span></div><div><b>{wishlistCount}</b><span>想去的地方</span></div><p>去过的地方会点亮为实心坐标，想去的地方会保留为下一段旅程。</p></div>
    <section className="footprint-layout">
      <div className="map-panel">
        <OpenStreetFootprintMap items={items} selectedId={selectedId} onSelect={setSelectedId} onEdit={setEditing} />
        {geocoding && <div className="map-loading">正在解析地图区域…</div>}
        <div className="map-legend"><span><i className="visited" />已去过</span><span><i className="selected" />当前选中</span><span><i className="wishlist" />想去</span></div>
      </div>
      <aside className="footprint-side">
        <div className="filter-row"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "visited" ? "active" : ""} onClick={() => setFilter("visited")}>已去过</button><button className={filter === "wishlist" ? "active" : ""} onClick={() => setFilter("wishlist")}>想去</button></div>
        <div className="footprint-list">{visible.length ? visible.map((item) => { const cover = images.find((image) => image.footprint_id === item.id); return <button key={item.id} className={`${item.status} ${selectedId === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)}>{cover ? <img src={`/api/footprint-image/${cover.id}`} alt="" /> : <span className="footprint-placeholder">⌖</span>}<span><small>{item.status === "visited" ? "● 已点亮" : "○ 想去"}</small><b>{item.name}</b><em>{item.visited_at ? new Date(item.visited_at).toLocaleDateString("zh-CN") : "未来某一天"}</em></span></button>; }) : <div className="empty-list"><b>这里还是空白</b><p>留下一个去过或想去的地方。</p></div>}</div>
      </aside>
    </section>
    {selected && <section className="footprint-story"><div className="section-heading"><div><span className="eyebrow">{selected.status === "visited" ? "这片地图已经点亮" : "未来目的地"}</span><h3>{selected.name}</h3></div><button className="soft-button" onClick={() => setEditing(selected)}>编辑足迹</button></div><p>{selected.content || "还没有写下这里的故事。"}</p>{selectedImages.length > 0 && <div className="footprint-gallery">{selectedImages.map((image) => <img key={image.id} src={`/api/footprint-image/${image.id}`} alt={`${selected.name}足迹照片`} loading="lazy" />)}</div>}</section>}
    {editing && <FootprintDialog item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onReload(); }} />}
  </>;
}

function FootprintDialog({ item, onClose, onSaved }: { item?: Footprint; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? "");
  const [status, setStatus] = useState<"visited" | "wishlist">(item?.status ?? "visited");
  const [content, setContent] = useState(item?.content ?? "");
  const [visitedAt, setVisitedAt] = useState(item?.visited_at ?? new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(); if (item) form.append("id", item.id); form.append("name", name); form.append("status", status); form.append("content", content); if (status === "visited") form.append("visitedAt", visitedAt); files.forEach((file) => form.append("images", file));
    const response = await fetch("/api/footprints", { method: "POST", body: form }); setBusy(false); if (response.ok) await onSaved();
  }
  async function remove() { if (!item) return; setBusy(true); const response = await fetch(`/api/footprints?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }); setBusy(false); if (response.ok) await onSaved(); }
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="dialog footprint-dialog" onSubmit={submit}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">旅行足迹</span><h2>{item ? "编辑足迹" : "留下一个地方"}</h2><p>地点名称将用于 OpenStreetMap 定位并绘制区域。</p><label><span>地点</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：京都，日本" /></label><label><span>状态</span><div className="duration-row"><button type="button" className={status === "visited" ? "active" : ""} onClick={() => setStatus("visited")}>已去过 · 点亮</button><button type="button" className={status === "wishlist" ? "active" : ""} onClick={() => setStatus("wishlist")}>未来想去</button></div></label>{status === "visited" && <label><span>到访日期</span><input type="date" required value={visitedAt} onChange={(event) => setVisitedAt(event.target.value)} /></label>}<label><span>足迹内容</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="发生了什么？为什么记得这里？" /></label><label><span>上传图片（最多6张，每张不超过8MB）</span><input className="file-input" type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 6))} />{files.length > 0 && <small className="file-note">已选择 {files.length} 张图片</small>}</label><div className="dialog-actions">{item ? <button type="button" className={confirmDelete ? "danger-button confirm" : "danger-button"} disabled={busy} onClick={() => confirmDelete ? remove() : setConfirmDelete(true)}>{confirmDelete ? "再次点击确认删除" : "删除足迹"}</button> : <span />}<button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存足迹"}</button></div></form></div>;
}

function Finance({ records, actions, busy, mutate }: { records: FinancialRecord[]; actions: Action[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinancialRecord | null>(null);
  const latest = (category: FinancialRecord["category"]) => records.find((item) => item.category === category)?.amount ?? 0;
  const month = new Date().toISOString().slice(0, 7);
  const flow = (category: FinancialRecord["category"]) => records.filter((item) => item.category === category && item.recorded_at.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
  const cash = latest("cash"), investment = latest("investment"), income = flow("income");
  const expenseTypes: FinancialRecord["category"][] = ["fixed_expense", "daily_expense", "social_expense", "exercise_expense", "learning_expense"];
  const expense = expenseTypes.reduce((sum, category) => sum + flow(category), 0);
  const monthlyIncomeRecords = records.filter((item)=>item.category==="income"&&item.recorded_at.startsWith(month));
  const salaryIncome = monthlyIncomeRecords.filter((item)=>item.income_type==="salary").reduce((sum,item)=>sum+item.amount,0);
  const nonSalaryIncome = monthlyIncomeRecords.filter((item)=>item.income_type==="non_salary").reduce((sum,item)=>sum+item.amount,0);
  const businessExpense = records.filter((item)=>expenseTypes.includes(item.category)&&item.expense_scope==="business"&&item.recorded_at.startsWith(month)).reduce((sum,item)=>sum+item.amount,0);
  const sourceTotals = monthlyIncomeRecords.reduce<Record<string,number>>((result,item)=>{const key=item.source_name||"未标注来源";result[key]=(result[key]||0)+item.amount;return result;},{});
  const concentration = income ? Math.round(Math.max(0,...Object.values(sourceTotals))/income*100) : 0;
  const fixedAssetCount = records.filter((item) => item.category === "fixed_asset" || item.category === "property").length;
  const currency = (value: number) => `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  return <>
    <PageHeader kicker="现金流与资产底盘" title="当前财务情况"><button className="primary-button" onClick={() => setAdding(true)}>＋ 添加财务记录</button></PageHeader>
    <div className="finance-grid">
      <article><span>可用现金</span><b>{currency(cash)}</b><small>最新快照</small></article>
      <article><span>固定资产</span><b>{fixedAssetCount} 项</b><small>只记录描述，不估值</small></article>
      <article><span>投资</span><b>{currency(investment)}</b><small>最新快照</small></article>
      <article><span>本月收入</span><b>{currency(income)}</b><small>累计记录</small></article>
      <article><span>工资 / 非工资收入</span><b>{currency(salaryIncome)} / {currency(nonSalaryIncome)}</b><small>收入结构</small></article>
      <article><span>本月总支出</span><b>{currency(expense)}</b><small>五类支出累计</small></article>
      <article><span>经营利润</span><b>{currency(nonSalaryIncome-businessExpense)}</b><small>非工资收入 − 经营支出</small></article>
      <article><span>收入来源集中度</span><b>{income?`${concentration}%`:"—"}</b><small>最大单一来源占比</small></article>
      <article className="net-worth"><span>可计算资产</span><b>{currency(cash + investment)}</b><small>现金 + 投资</small></article>
      <article><span>结余率</span><b>{income ? `${Math.round((income - expense) / income * 100)}%` : "—"}</b><small>收入减固定支出</small></article>
    </div>
    <section className="finance-list"><div className="section-heading"><div><span className="eyebrow">全部财务记录</span><h3>每笔数据都可编辑，也可追溯到任务</h3></div></div>{records.length ? records.map((item) => {
      const descriptionOnly = item.category === "fixed_asset" || item.category === "property";
      return <article key={item.id}><span className={`finance-category ${item.category}`}>{financeLabel(item.category)}</span><div><b>{descriptionOnly ? item.note || "固定资产" : currency(item.amount)}</b><p>{descriptionOnly ? "不估值、不计入可计算资产" : `${item.note || "未填写备注"}${item.category==="income"?` · ${item.income_type==="salary"?"工资":"非工资"}${item.source_name?` / ${item.source_name}`:""}`:/expense$/.test(item.category)?` · ${item.expense_scope==="business"?"经营支出":"个人支出"}`:""}`}{item.action_id ? ` · 关联：${actions.find((action) => action.id === item.action_id)?.title || "任务"}` : ""}</p></div><div className="finance-record-meta"><time>{new Date(item.recorded_at).toLocaleDateString("zh-CN")}</time><button onClick={() => setEditing(item)}>编辑</button></div></article>;
    }) : <div className="empty-list"><b>还没有财务数据</b><p>添加现金、固定资产、投资、收入或固定支出，形成第一张财务快照。</p></div>}</section>
    {adding && <FinanceDialog actions={actions} busy={busy} onClose={() => setAdding(false)} onSave={async (values) => { const ok = await mutate({ action: "financial-record", ...values }, "财务记录已保存"); if (ok) setAdding(false); }} />}
    {editing && <FinanceDialog record={editing} actions={actions} busy={busy} onClose={() => setEditing(null)} onSave={async (values) => { const ok = await mutate({ action: "update-financial-record", id: editing.id, ...values }, "财务记录已更新"); if (ok) setEditing(null); }} onDelete={async () => { const ok = await mutate({ action: "delete-financial-record", id: editing.id }, "财务记录已删除"); if (ok) setEditing(null); }} />}
  </>;
}

function financeLabel(category: FinancialRecord["category"]) { return { cash: "现金", fixed_asset: "固定资产", investment: "投资", property: "固定资产", income: "收入", fixed_expense: "固定支出", daily_expense: "日常消费", social_expense: "请客", exercise_expense: "运动", learning_expense: "学习" }[category]; }

function ReviewPanel({ completedActions, actionTotal, exerciseCount, englishCount, reviews, busy, mutate }: { completedActions: number; actionTotal: number; exerciseCount: number; englishCount: number; reviews: Review[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [achievement, setAchievement] = useState("");
  const [lowValue, setLowValue] = useState("");
  const [healthCheck, setHealthCheck] = useState("");
  const [marketEvidence, setMarketEvidence] = useState("");
  const [energyScore, setEnergyScore] = useState(7);
  const [nextPriority, setNextPriority] = useState("");
  const [decision, setDecision] = useState<Review["decision"]>("continue");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate({ action: "review", achievement, lowValue, healthCheck, marketEvidence, energyScore, nextPriority, decision }, "周复盘已保存，系统已自动检查停止规则");
    if (ok) { setAchievement(""); setLowValue(""); setHealthCheck(""); setMarketEvidence(""); setEnergyScore(7); setNextPriority(""); setDecision("continue"); }
  }
  return <>
    <PageHeader kicker="把真实生活带回计划" title="本周复盘"><span className="capacity-badge">约 8 分钟</span></PageHeader>
    <div className="review-metrics"><div><span>行动完成</span><b>{completedActions}/{actionTotal}</b></div><div><span>运动次数</span><b>{exerciseCount}</b></div><div><span>英语练习</span><b>{englishCount}</b></div><div><span>负载状态</span><b className="healthy">可持续</b></div></div>
    <section className="review-layout">
      <form className="review-form" onSubmit={submit}><label><span>1 · 本周最重要的成果是什么？</span><textarea required value={achievement} onChange={(event) => setAchievement(event.target.value)} /></label><label><span>2 · 哪件事消耗很大但价值较低？</span><textarea value={lowValue} onChange={(event) => setLowValue(event.target.value)} /></label><label><span>3 · 睡眠、健康、英语或关系是否被挤压？</span><textarea required value={healthCheck} onChange={(event)=>setHealthCheck(event.target.value)} placeholder="写事实；系统会结合连续两周数据判断…" /></label><label><span>4 · 本周获得了什么真实市场证据？</span><textarea required value={marketEvidence} onChange={(event)=>setMarketEvidence(event.target.value)} placeholder="用户反馈、付费、面试、作品数据；没有也请写“暂无”…" /></label><label><span>5 · 当前能量：{energyScore}/10</span><input className="range-input" type="range" min="1" max="10" value={energyScore} onChange={(event)=>setEnergyScore(Number(event.target.value))} /></label><label><span>6 · 下周唯一必须推进的里程碑是什么？</span><textarea required value={nextPriority} onChange={(event) => setNextPriority(event.target.value)} /></label><label><span>7 · 继续、调整还是停止？</span><select value={decision} onChange={(event)=>setDecision(event.target.value as Review["decision"])}><option value="continue">继续</option><option value="adjust">调整方向或范围</option><option value="stop">停止商业方向</option></select></label><button className="primary-button" disabled={busy}>{busy ? "正在分析规则…" : "保存并自动判断"}<span>→</span></button></form>
      <aside className="review-draft"><span className="ai-mark">✦</span><span className="eyebrow">自动停止规则</span><h3>连续数据决定是否继续</h3><div><b>客观数据</b><p>本周完成 {completedActions}/{actionTotal} 项重点，记录运动 {exerciseCount} 次、英语 {englishCount} 次。</p></div><div><b>系统规则</b><p>连续两周低能量或健康承压会自动减量；连续三周无市场证据要求调整，四周则建议停止。</p></div>{reviews[0]&&<><div className={`auto-decision ${reviews[0].auto_decision}`}><b>系统判断 · {{continue:"继续",adjust:"调整",stop:"停止"}[reviews[0].auto_decision]}</b><p>{reviews[0].kill_rule_count?`触发 ${reviews[0].kill_rule_count} 条规则`:`未触发停止规则`} · {reviews[0].next_priority}</p></div>{reviews[0].kill_rule_count>0&&<div><b>触发原因</b><p>{(() => { try{return (JSON.parse(reviews[0].auto_reasons) as Array<{reason:string}>).map((item)=>item.reason).join("；");}catch{return "已触发自动规则";} })()}</p></div>}</>}</aside>
    </section>
  </>;
}

const journeyAreas = ["健康", "英语", "职业", "收入", "财务与资产", "关系与家庭", "探索与生活"];

function JourneyTaskDialog({journey,item,busy,onClose,onSave,onDelete}:{journey:Journey;item?:JourneyTask;busy:boolean;onClose:()=>void;onSave:(values:Record<string,unknown>)=>void;onDelete?:()=>void}){
  const [title,setTitle]=useState(item?.title||""),[acceptanceCriteria,setAcceptance]=useState(item?.acceptance_criteria||""),[estimatedMinutes,setMinutes]=useState(item?.estimated_minutes||60),[taskType,setTaskType]=useState<JourneyTask["task_type"]>(item?.task_type||"general"),[executionFrequency,setExecutionFrequency]=useState<JourneyTask["execution_frequency"]>(item?.execution_frequency||"monthly"),[confirmDelete,setConfirmDelete]=useState(false);
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog task-dialog" onSubmit={(event)=>{event.preventDefault();onSave({title,acceptanceCriteria,estimatedMinutes,taskType,executionFrequency});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">征程子任务</span><h2>{item?"编辑子任务":"创建子任务"}</h2><p>归属「{journey.title}」。AI 会按照周任务或月任务规则自动生成计划。</p><label><span>任务名称</span><input required maxLength={120} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="一个明确、可独立完成的行动" /></label><label><span>完成标准</span><textarea required maxLength={500} value={acceptanceCriteria} onChange={(event)=>setAcceptance(event.target.value)} placeholder="每周或当月留下什么结果，才算完成？" /></label><div className="frequency-options"><label className={executionFrequency==="weekly"?"selected":""}><input type="radio" name="execution-frequency" value="weekly" checked={executionFrequency==="weekly"} onChange={()=>setExecutionFrequency("weekly")} /><b>周任务</b><small>每周自动安排一次，月计划按当月完成周数统计</small></label><label className={executionFrequency==="monthly"?"selected":""}><input type="radio" name="execution-frequency" value="monthly" checked={executionFrequency==="monthly"} onChange={()=>setExecutionFrequency("monthly")} /><b>月任务</b><small>月计划生成一次性成果，AI 在合适的周安排推进</small></label></div><div className="field-grid"><label><span>单次预计分钟</span><input type="number" min="15" max="1200" step="15" value={estimatedMinutes} onChange={(event)=>setMinutes(Number(event.target.value))} /></label><label><span>任务类型</span><select value={taskType} onChange={(event)=>setTaskType(event.target.value as JourneyTask["task_type"])}><option value="general">通用</option><option value="reading">阅读</option><option value="finance">财务</option><option value="exercise">运动</option><option value="english">英语</option></select></label></div><div className="dialog-actions">{item&&onDelete?<button type="button" className={confirmDelete?"danger-button confirm":"danger-button"} onClick={()=>confirmDelete?onDelete():setConfirmDelete(true)}>{confirmDelete?"再次点击确认删除":"删除子任务"}</button>:<span/>}<button className="primary-button" disabled={busy||!title.trim()||!acceptanceCriteria.trim()}>{busy?"保存中…":"保存子任务"}</button></div></form></div>;
}

function JourneyCompleteDialog({ journey, busy, onClose, onSubmit }: { journey: Journey; busy: boolean; onClose: () => void; onSubmit: (evidence: string) => void }) {
  const [evidence,setEvidence]=useState(journey.evidence||"");
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog" onSubmit={(event)=>{event.preventDefault();onSubmit(evidence);}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">征程 {String(journey.sequence_number).padStart(2,"0")}</span><h2>提交完成证据</h2><p>系统将优先使用 AI 严格对照验收标准；AI 暂不可达时自动使用智能规则验收：{journey.acceptance_criteria}</p>{journey.evidence_review_status==="needs_more"&&<div className="evidence-review-note"><b>上次验收 {journey.evidence_score}分</b><span>{journey.evidence_review_feedback}</span></div>}<label><span>成果或验证证据</span><textarea required maxLength={3000} value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder="写下已经完成的结果、数据、链接或关键结论……" /></label><button className="primary-button full" disabled={busy||!evidence.trim()}>{busy?"验收中…":"提交智能验收"}</button></form></div>;
}

function OutcomeDialog({ item, journeys, busy, onClose, onSave, onDelete }: { item?: Outcome; journeys: Journey[]; busy: boolean; onClose: () => void; onSave: (values: Record<string, unknown>) => void; onDelete?: () => void }) {
  const [title,setTitle]=useState(item?.title ?? ""),[acceptanceCriteria,setAcceptance]=useState(item?.acceptance_criteria ?? ""),[progress,setProgress]=useState(item?.progress ?? 0),[expectedHours,setExpectedHours]=useState(item?.expected_hours ?? 6),[journeyId,setJourneyId]=useState(item?.journey_id ?? journeys.find((journey)=>journey.status==="active")?.id ?? ""),[kind,setKind]=useState<Outcome["kind"]>(item?.kind ?? "milestone"),[confirmDelete,setConfirmDelete]=useState(false);
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog outcome-dialog" onSubmit={(event)=>{event.preventDefault();onSave({title,acceptanceCriteria,progress,expectedHours,journeyId,kind});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">月度成果</span><h2>{item ? "编辑月度成果" : "新增月度成果"}</h2><p>里程碑按关联任务计算进度；习惯按本月记录次数自动计算。</p><label><span>成果名称</span><input required maxLength={100} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="例如：完成个人作品集第一版" /></label><label><span>关联征程</span><select required value={journeyId} onChange={(event)=>setJourneyId(event.target.value)}><option value="">请选择当前征程</option>{journeys.filter((journey)=>journey.status==="active"||journey.id===item?.journey_id).map((journey)=><option key={journey.id} value={journey.id}>{String(journey.sequence_number).padStart(2,"0")} · {journey.title}</option>)}</select></label><div className="field-grid"><label><span>成果类型</span><select value={kind} onChange={(event)=>setKind(event.target.value as Outcome["kind"])}><option value="milestone">一次性里程碑</option><option value="habit">持续习惯</option></select></label><label><span>预计投入（小时）</span><input required type="number" min="1" max="200" value={expectedHours} onChange={(event)=>setExpectedHours(Number(event.target.value))} /></label></div><label><span>完成标准</span><textarea required maxLength={500} value={acceptanceCriteria} onChange={(event)=>setAcceptance(event.target.value)} placeholder={kind==="habit"?"例如：本月完成12次，每次提交记录":"达到什么状态才算完成？"} /></label><label><span>当前进度（自动计算，可校正）</span><input required type="number" min="0" max="100" value={progress} onChange={(event)=>setProgress(Number(event.target.value))} /></label><div className="dialog-actions">{item&&onDelete?<button type="button" className={confirmDelete?"danger-button confirm":"danger-button"} disabled={busy} onClick={()=>confirmDelete?onDelete():setConfirmDelete(true)}>{confirmDelete?"再次点击确认删除":"删除成果"}</button>:<span/>}<button className="primary-button" disabled={busy||!journeyId}>{busy?"保存中…":"保存月度成果"}</button></div></form></div>;
}

function WeeklyActionDialog({ item, outcomes, journeyTasks, journeys, busy, onClose, onSave, onDelete }: { item?: Action; outcomes: Outcome[];journeyTasks:JourneyTask[];journeys:Journey[]; busy: boolean; onClose: () => void; onSave: (values: Record<string, unknown>) => void; onDelete?: () => void }) {
  const availableTasks=journeyTasks.filter((task)=>task.status==="pending");
  const first=availableTasks[0];
  const [sourceTaskId,setSourceTaskId]=useState(item?.source_task_id||first?.id||""),[title,setTitle]=useState(item?.title??first?.title??""),[outcomeId,setOutcomeId]=useState(item?.outcome_id??""),[estimatedMinutes,setMinutes]=useState(item?.estimated_minutes??first?.estimated_minutes??30),[scheduledFor,setDay]=useState(item?.scheduled_for??"本周"),[taskType,setTaskType]=useState<Action["task_type"]>(item?.task_type??first?.task_type??"general"),[isSideHustle,setIsSideHustle]=useState(Boolean(item?.is_side_hustle)),[confirmDelete,setConfirmDelete]=useState(false);
  function chooseTask(id:string){setSourceTaskId(id);const task=availableTasks.find((candidate)=>candidate.id===id);if(task){setTitle(task.title);setMinutes(task.estimated_minutes);setTaskType(task.task_type);setOutcomeId(outcomes.find((candidate)=>candidate.journey_id===task.journey_id)?.id||"");}}
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog task-dialog" onSubmit={(event)=>{event.preventDefault();onSave({sourceTaskId,title,outcomeId,estimatedMinutes,scheduledFor,taskType,isSideHustle});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">本周任务</span><h2>{item?"编辑周任务":"从征程加入本周"}</h2><p>{item?"调整本周安排，不改变原征程子任务。":"周任务必须来自征程子任务，确保每一步都有来源。"}</p>{!item&&<label><span>选择征程子任务</span><select required value={sourceTaskId} onChange={(event)=>chooseTask(event.target.value)}><option value="">请选择未完成子任务</option>{availableTasks.map((task)=><option key={task.id} value={task.id}>{journeys.find((journey)=>journey.id===task.journey_id)?.title||"征程"} → {task.title}</option>)}</select></label>}<label><span>任务名称</span><input required readOnly={!item} maxLength={120} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="先选择一个征程子任务" /></label><label><span>关联月度成果（可选）</span><select value={outcomeId} onChange={(event)=>setOutcomeId(event.target.value)}><option value="">暂不关联</option>{outcomes.map((outcome)=><option key={outcome.id} value={outcome.id}>{outcome.title}</option>)}</select></label><div className="field-grid"><label><span>安排时间</span><select value={scheduledFor} onChange={(event)=>setDay(event.target.value)}>{["本周","周一","周二","周三","周四","周五","周六","周日"].map((day)=><option key={day}>{day}</option>)}</select></label><label><span>预计分钟</span><input required type="number" min="15" max="600" step="5" value={estimatedMinutes} onChange={(event)=>setMinutes(Number(event.target.value))} /></label></div><label><span>任务类型</span><select value={taskType} onChange={(event)=>setTaskType(event.target.value as Action["task_type"])}><option value="general">通用</option><option value="reading">阅读</option><option value="finance">财务</option><option value="exercise">运动</option><option value="english">英语</option></select></label><label className="check-field"><input type="checkbox" checked={isSideHustle} onChange={(event)=>setIsSideHustle(event.target.checked)} /><span>计入副业时间上限</span></label><div className="dialog-actions">{item&&onDelete?<button type="button" className={confirmDelete?"danger-button confirm":"danger-button"} disabled={busy} onClick={()=>confirmDelete?onDelete():setConfirmDelete(true)}>{confirmDelete?"再次点击确认删除":"删除任务"}</button>:<span/>}<button className="primary-button" disabled={busy||(!item&&!sourceTaskId)}>{busy?"保存中…":item?"保存任务修改":"加入本周"}</button></div></form></div>;
}

function JourneyCreateDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (values: { title: string; area: string; acceptanceCriteria: string; nextAction: string }) => void }) {
  const [title,setTitle]=useState(""),[area,setArea]=useState("职业"),[acceptanceCriteria,setAcceptance]=useState(""),[nextAction,setNext]=useState("");
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog journey-dialog" onSubmit={(event)=>{event.preventDefault();onSave({title,area,acceptanceCriteria,nextAction});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">100次征程</span><h2>添加一次新征程</h2><p>先写清完成标准，路线可以在行动中调整。</p><div className="field-grid"><label><span>征程名称</span><input required maxLength={80} value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="例如：完成第一篇公开文章" /></label><label><span>人生领域</span><select value={area} onChange={(event)=>setArea(event.target.value)}>{journeyAreas.map((item)=><option key={item}>{item}</option>)}</select></label></div><label><span>验收标准</span><textarea required value={acceptanceCriteria} onChange={(event)=>setAcceptance(event.target.value)} placeholder="怎样才算真正完成？" /></label><label><span>下一步行动</span><input required value={nextAction} onChange={(event)=>setNext(event.target.value)} placeholder="下一步最小行动" /></label><button className="primary-button full" disabled={busy}>{busy?"添加中…":"添加征程"}</button></form></div>;
}

function WeeklySettingsDialog({ profile, busy, onClose, onSave }: { profile: Profile; busy: boolean; onClose: () => void; onSave: (capacity: number, goal: string, sideHustleLimit: number, protectedDay: string, generate: boolean) => void }) {
  const [capacity,setCapacity]=useState(profile.weekly_capacity_minutes),[goal,setGoal]=useState(profile.weekly_goal),[sideHustleLimit,setSideHustleLimit]=useState(profile.side_hustle_limit_minutes),[protectedDay,setProtectedDay]=useState(profile.protected_day);
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog settings-dialog" onSubmit={(event)=>{event.preventDefault();onSave(capacity,goal,sideHustleLimit,protectedDay,true);}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="ai-mark">✦</span><span className="eyebrow">动态周计划</span><h2>本周时间、目标与护栏</h2><p>AI 只安排约 85% 的时间，并优先保护健康、主业和休息。</p><label><span>每周可用时间：{Math.round(capacity/6)/10} 小时</span><input className="range-input" type="range" min="60" max="1200" step="30" value={capacity} onChange={(event)=>setCapacity(Number(event.target.value))} /></label><label><span>副业时间上限：{Math.round(sideHustleLimit/6)/10} 小时</span><input className="range-input" type="range" min="0" max="720" step="30" value={sideHustleLimit} onChange={(event)=>setSideHustleLimit(Number(event.target.value))} /></label><label><span>完全休息日</span><select value={protectedDay} onChange={(event)=>setProtectedDay(event.target.value)}>{["周一","周二","周三","周四","周五","周六","周日"].map((day)=><option key={day}>{day}</option>)}</select></label><label><span>本周目标</span><textarea required value={goal} onChange={(event)=>setGoal(event.target.value)} placeholder="例如：完成英文自我介绍，并能自然讲满3分钟" /></label><div className="dialog-actions"><button type="button" className="soft-button" disabled={busy} onClick={()=>onSave(capacity,goal,sideHustleLimit,protectedDay,false)}>仅保存</button><button className="primary-button" disabled={busy}>{busy?"正在生成…":"保存并生成计划"}</button></div></form></div>;
}

function TaskCompleteDialog({ action, busy, onClose, onSubmit }: { action: Action; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, unknown>) => void }) {
  const [content,setContent]=useState(""),[duration,setDuration]=useState(30),[feeling,setFeeling]=useState(""),[category,setCategory]=useState<FinancialRecord["category"]>("cash"),[amount,setAmount]=useState(""),[recordedAt,setDate]=useState(new Date().toISOString().slice(0,10)),[incomeType,setIncomeType]=useState<FinancialRecord["income_type"]>("salary"),[sourceName,setSourceName]=useState(""),[expenseScope,setExpenseScope]=useState<FinancialRecord["expense_scope"]>("personal");
  const prompts={reading:["读书笔记","写下核心观点、触动和下一步实践…"],english:["英语学习笔记","记录新表达、错误与改进…"],finance:["财务备注","说明这笔数据的口径…"],exercise:["运动记录",""],general:["完成成果（可选）","留下一句话，说明完成了什么…"]} as const;
  const [label,placeholder]=prompts[action.task_type];
  const descriptionOnly = category === "fixed_asset" || category === "property";
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog complete-dialog" onSubmit={(event)=>{event.preventDefault();onSubmit({content,duration,feeling,category,amount,recordedAt,incomeType,sourceName,expenseScope});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className={`task-type ${action.task_type}`}>{taskTypeLabel(action.task_type)}任务</span><h2>提交完成成果</h2><p>{action.title}</p>{action.task_type==="exercise"?<><label><span>运动时间（分钟）</span><input type="number" min="1" max="600" required value={duration} onChange={(event)=>setDuration(Number(event.target.value))} /></label><label><span>运动感受</span><textarea required value={feeling} onChange={(event)=>setFeeling(event.target.value)} placeholder="身体状态、强度和恢复感受…" /></label></>:<label><span>{descriptionOnly ? "固定资产描述" : label}</span><textarea required={action.task_type==="reading"||action.task_type==="english"||descriptionOnly} value={content} onChange={(event)=>setContent(event.target.value)} placeholder={descriptionOnly ? "例如：自住房一套，位于杭州，暂不估值" : placeholder} /></label>}{action.task_type==="finance"&&<><div className={descriptionOnly ? "field-grid single" : "field-grid"}><label><span>数据类型</span><select value={category} onChange={(event)=>setCategory(event.target.value as FinancialRecord["category"])}><option value="cash">现金</option><option value="fixed_asset">固定资产</option><option value="investment">投资</option><option value="income">收入</option><option value="fixed_expense">固定支出</option><option value="daily_expense">日常消费</option><option value="social_expense">请客</option><option value="exercise_expense">运动</option><option value="learning_expense">学习</option></select></label>{!descriptionOnly&&<label><span>金额（元）</span><input type="number" min="0" step="0.01" required value={amount} onChange={(event)=>setAmount(event.target.value)} /></label>}</div>{category==="income"&&<div className="field-grid"><label><span>收入类型</span><select value={incomeType} onChange={(event)=>setIncomeType(event.target.value as FinancialRecord["income_type"])}><option value="salary">工资收入</option><option value="non_salary">非工资收入</option></select></label><label><span>收入来源</span><input value={sourceName} onChange={(event)=>setSourceName(event.target.value)} placeholder="公司 / 客户 / 产品" /></label></div>}{/expense$/.test(category)&&<label><span>支出归属</span><select value={expenseScope} onChange={(event)=>setExpenseScope(event.target.value as FinancialRecord["expense_scope"])}><option value="personal">个人支出</option><option value="business">经营支出</option></select></label>}<label><span>记录日期</span><input type="date" value={recordedAt} onChange={(event)=>setDate(event.target.value)} /></label></>}<button className="primary-button full" disabled={busy}>{busy?"提交中…":"确认完成并保存成果"}</button></form></div>;
}

function FinanceDialog({ record, actions, busy, onClose, onSave, onDelete }: { record?: FinancialRecord; actions: Action[]; busy: boolean; onClose: () => void; onSave: (values: Record<string,unknown>) => void; onDelete?: () => void }) {
  const initialCategory = record?.category === "property" ? "fixed_asset" : record?.category ?? "cash";
  const [category,setCategory]=useState<FinancialRecord["category"]>(initialCategory),[amount,setAmount]=useState(record && initialCategory !== "fixed_asset" ? String(record.amount) : ""),[note,setNote]=useState(record?.note ?? ""),[recordedAt,setDate]=useState(record?.recorded_at ?? new Date().toISOString().slice(0,10)),[actionId,setActionId]=useState(record?.action_id ?? ""),[incomeType,setIncomeType]=useState<FinancialRecord["income_type"]>(record?.income_type||"salary"),[sourceName,setSourceName]=useState(record?.source_name??""),[expenseScope,setExpenseScope]=useState<FinancialRecord["expense_scope"]>(record?.expense_scope||"personal"),[confirmDelete,setConfirmDelete]=useState(false);
  const descriptionOnly = category === "fixed_asset" || category === "property";
  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
  return <div className="dialog-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><form className="dialog" onSubmit={(event)=>{event.preventDefault();onSave({category,amount,recordedAt,note,actionId,incomeType,sourceName,expenseScope});}}><button type="button" className="dialog-close" onClick={onClose}>×</button><span className="eyebrow">财务记录</span><h2>{record ? "编辑财务记录" : "添加一条数据"}</h2><p>固定资产只记录事实描述；收入来源与经营支出用于计算收入结构和经营利润。</p><div className={descriptionOnly ? "field-grid single" : "field-grid"}><label><span>类型</span><select value={category} onChange={(event)=>setCategory(event.target.value as FinancialRecord["category"])}><option value="cash">现金</option><option value="fixed_asset">固定资产</option><option value="investment">投资</option><option value="income">收入</option><option value="fixed_expense">固定支出</option><option value="daily_expense">日常消费</option><option value="social_expense">请客</option><option value="exercise_expense">运动</option><option value="learning_expense">学习</option></select></label>{!descriptionOnly&&<label><span>金额（元）</span><input required type="number" min="0" step="0.01" value={amount} onChange={(event)=>setAmount(event.target.value)} /></label>}</div>{category==="income"&&<div className="field-grid"><label><span>收入类型</span><select value={incomeType} onChange={(event)=>setIncomeType(event.target.value as FinancialRecord["income_type"])}><option value="salary">工资收入</option><option value="non_salary">非工资收入</option></select></label><label><span>收入来源</span><input value={sourceName} onChange={(event)=>setSourceName(event.target.value)} placeholder="公司 / 客户 / 产品" /></label></div>}{/expense$/.test(category)&&<label><span>支出归属</span><select value={expenseScope} onChange={(event)=>setExpenseScope(event.target.value as FinancialRecord["expense_scope"])}><option value="personal">个人支出</option><option value="business">经营支出</option></select></label>}<label><span>{descriptionOnly ? "固定资产描述" : "备注"}</span><textarea required={descriptionOnly} value={note} onChange={(event)=>setNote(event.target.value)} placeholder={descriptionOnly ? "例如：自住房一套，位于杭州，暂不估值" : "补充数据口径或说明（可选）"} /></label><label><span>关联任务（可选）</span><select value={actionId} onChange={(event)=>setActionId(event.target.value)}><option value="">不关联任务</option>{actions.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>日期</span><input type="date" value={recordedAt} onChange={(event)=>setDate(event.target.value)} /></label><div className="dialog-actions">{record&&onDelete?<button type="button" className={confirmDelete?"danger-button confirm":"danger-button"} disabled={busy} onClick={()=>confirmDelete?onDelete():setConfirmDelete(true)}>{confirmDelete?"再次点击确认删除":"删除记录"}</button>:<span/>}<button className="primary-button" disabled={busy}>{busy?"保存中…":"保存财务记录"}</button></div></form></div>;
}

function JourneyDialog({ journey, busy, onClose, onSave, onDelete }: {
  journey: Journey;
  busy: boolean;
  onClose: () => void;
  onSave: (values: { title: string; area: string; acceptanceCriteria: string; nextAction: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(journey.title);
  const [area, setArea] = useState(journey.area);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(journey.acceptance_criteria);
  const [nextAction, setNextAction] = useState(journey.next_action);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const areas = journeyAreas;

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="dialog journey-dialog" onSubmit={(event) => { event.preventDefault(); onSave({ title, area, acceptanceCriteria, nextAction }); }}><button type="button" className="dialog-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">征程 {String(journey.sequence_number).padStart(2, "0")}</span><h2>编辑征程</h2><p>路线可以调整，验收标准要始终清楚。</p><div className="field-grid"><label><span>征程名称</span><input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>人生领域</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((item) => <option key={item}>{item}</option>)}</select></label></div><label><span>验收标准</span><textarea required maxLength={300} value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} /></label><label><span>下一步行动</span><input required maxLength={160} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label><div className="dialog-actions"><button type="button" className={confirmDelete ? "danger-button confirm" : "danger-button"} disabled={busy} onClick={() => { if (confirmDelete) onDelete(); else setConfirmDelete(true); }}>{confirmDelete ? "再次点击确认删除" : "删除征程"}</button><button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存修改"}</button></div></form></div>;
}

function AdjustPlanDialog({ actions, busy, onClose, onAdjust }: {
  actions: Action[];
  busy: boolean;
  onClose: () => void;
  onAdjust: (mode: string, message: string) => void;
}) {
  const active = actions.filter((item) => item.status !== "paused");
  const minutes = active.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const pausedCount = actions.filter((item) => item.status === "paused").length;
  const hours = Math.round(minutes / 6) / 10;

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog adjust-dialog" role="dialog" aria-modal="true" aria-labelledby="adjust-title"><button className="dialog-close" onClick={onClose} aria-label="关闭">×</button><span className="ai-mark">✦</span><span className="eyebrow">基于当前容量</span><h2 id="adjust-title">调整本周计划</h2><div className="capacity-overview"><span><b>{hours}h</b>当前安排</span><i><b style={{ width: `${Math.min(100, minutes / 420 * 100)}%` }} /></i><span><b>7h</b>可用时间</span></div><p className="adjust-summary">{minutes <= 357 ? "当前安排留有约15%以上余量，不必为了填满时间继续加任务。" : minutes <= 420 ? "当前安排接近容量上限，如果精力偏低，建议主动缩小范围。" : "当前计划已经过载，建议先暂停低优先级任务。"}</p><div className="adjust-options"><button disabled={busy} onClick={() => onAdjust("pause-lowest", "已暂缓一项低优先级职业任务，为恢复留出空间")}><span>01</span><div><b>腾出恢复空间</b><small>暂缓优先级最低的非健康任务</small></div><i>约省 1h</i></button><button disabled={busy} onClick={() => onAdjust("shrink-scope", "已缩小一项职业任务的交付范围")}><span>02</span><div><b>缩小交付范围</b><small>保留成果方向，减少20分钟投入</small></div><i>少做一点</i></button>{pausedCount > 0 && <button disabled={busy} onClick={() => onAdjust("restore-paused", "已恢复本周暂缓的任务")}><span>03</span><div><b>恢复暂缓任务</b><small>把之前暂缓的行动重新放回本周</small></div><i>{pausedCount} 项</i></button>}</div><small className="explain-note">所有调整都需要你确认；系统不会自动增加任务。</small></section></div>;
}

function CheckinDialog({ type, busy, onClose, onSubmit }: { type: Checkin["type"]; busy: boolean; onClose: () => void; onSubmit: (duration: number, note: string) => void }) {
  const [duration, setDuration] = useState(type === "exercise" ? 45 : 30);
  const [note, setNote] = useState("");
  const label = type === "exercise" ? "运动" : type === "reading" ? "读书" : "英语学习";
  const noteRequired = type === "reading" || type === "english";
  const noteLabel = type === "reading" ? "读书笔记" : type === "english" ? "英语学习笔记" : "运动感受（可选）";
  const placeholder = type === "reading" ? "记录核心观点、触动你的内容，以及准备如何应用……" : type === "english" ? "记录新表达、错误、纠正和下一步练习重点……" : "今天身体感觉如何？";
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog checkin-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="关闭">×</button><span className={`record-mark ${type}`}>{type === "exercise" ? "↗" : type === "reading" ? "书" : "Aa"}</span><span className="eyebrow">快速记录</span><h2 id="dialog-title">完成一次{label}</h2><p>{noteRequired ? "提交笔记后，这次学习才会被记录。" : "记录时间和感受，观察身体的真实变化。"}</p><label><span>投入时间</span><div className="duration-row">{[20, 30, 45, 60].map((value) => <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(value)}>{value}分钟</button>)}</div></label><label><span>{noteLabel}</span>{noteRequired ? <textarea required value={note} onChange={(event) => setNote(event.target.value)} placeholder={placeholder} /> : <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={placeholder} />}</label><button className="primary-button full" disabled={busy || (noteRequired && !note.trim())} onClick={() => onSubmit(duration, note)}>{busy ? "正在保存…" : noteRequired ? "提交笔记并记录" : "记录完成"}</button></section></div>;
}
