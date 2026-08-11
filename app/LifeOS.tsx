"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Profile = {
  display_name: string;
  vision: string;
  target_date: string;
  initialized: number;
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
};

type Outcome = {
  id: string;
  title: string;
  acceptance_criteria: string;
  progress: number;
  expected_hours: number;
};

type Action = {
  id: string;
  outcome_id: string;
  title: string;
  estimated_minutes: number;
  scheduled_for: string;
  priority: number;
  status: "pending" | "completed";
};

type Checkin = {
  id: string;
  type: "exercise" | "english";
  duration: number;
  note: string;
  created_at: string;
};

type Review = {
  id: string;
  achievement: string;
  low_value: string;
  next_priority: string;
  created_at: string;
};

type Workspace = {
  profile: Profile;
  journeys: Journey[];
  outcomes: Outcome[];
  actions: Action[];
  checkins: Checkin[];
  reviews: Review[];
};

type Tab = "today" | "journeys" | "plan" | "records" | "review";

const tabs: { key: Tab; label: string; mark: string }[] = [
  { key: "today", label: "今日", mark: "⌂" },
  { key: "journeys", label: "征程", mark: "◎" },
  { key: "plan", label: "计划", mark: "◫" },
  { key: "records", label: "记录", mark: "+" },
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

export default function LifeOS() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkinType, setCheckinType] = useState<"exercise" | "english" | null>(null);

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
      const result = (await response.json()) as { error?: string };
      setNotice(result.error === "active_limit" ? "同时最多激活5次征程，请先暂停一项。" : "保存失败，请稍后重试。");
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
  const plannedMinutes = workspace.actions.reduce((sum, item) => sum + item.estimated_minutes, 0);
  const completedMinutes = workspace.actions
    .filter((item) => item.status === "completed")
    .reduce((sum, item) => sum + item.estimated_minutes, 0);

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
        <div className="vision-mini">
          <span className="eyebrow">40岁愿景</span>
          <p>在大多数普通日子里，我喜欢自己的生活。</p>
          <div className="years-row"><span>还有 8 年</span><i><b /></i></div>
        </div>
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
            onToggle={(id) => mutate({ action: "toggle-action", id }, "行动状态已更新")}
            onCheckin={setCheckinType}
            onNavigate={setTab}
          />
        )}
        {tab === "journeys" && <Journeys items={workspace.journeys} busy={saving} mutate={mutate} />}
        {tab === "plan" && <Plan outcomes={workspace.outcomes} actions={workspace.actions} busy={saving} onToggle={(id) => mutate({ action: "toggle-action", id })} />}
        {tab === "records" && <Records items={workspace.checkins} onCheckin={setCheckinType} />}
        {tab === "review" && (
          <ReviewPanel
            completedActions={completedActions}
            actionTotal={workspace.actions.length}
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
    </div>
  );
}

function Brand() {
  return <div className="brand"><span className="brand-mark">文</span><span><strong>文子的 LifeOS</strong><small>40岁征程工作台</small></span></div>;
}

function MobileHeader() {
  return <header className="mobile-header"><Brand /><button aria-label="打开个人设置">文</button></header>;
}

function Loading() {
  return <div className="loading-screen"><span className="brand-mark">文</span><p>正在整理今天最重要的事…</p></div>;
}

function ErrorState() {
  return <div className="loading-screen"><span className="brand-mark">文</span><h1>工作台暂时没有准备好</h1><p>刷新页面后再试一次。</p></div>;
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
          <div><b>5</b><span>当前激活征程</span></div>
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
  onToggle: (id: string) => void;
  onCheckin: (type: "exercise" | "english") => void;
  onNavigate: (tab: Tab) => void;
}) {
  const pending = props.workspace.actions.find((item) => item.status === "pending");
  const percentage = Math.round((props.completedActions / Math.max(props.workspace.actions.length, 1)) * 100);
  return (
    <>
      <PageHeader kicker="2026年8月11日 · 星期二" title="早上好，文子">
        <div className="stage-chip"><span />建立基线 · 第1周</div>
      </PageHeader>
      <section className="hero-grid">
        <article className="focus-card">
          <div className="card-topline"><span>今日最重要行动</span><i>高贡献</i></div>
          {pending ? <>
            <h2>{pending.title}</h2>
            <p className="focus-meta"><span>◷ {pending.estimated_minutes}分钟</span><span>·</span><span>对应首月成果</span></p>
            <div className="focus-reason"><b>为什么是它</b><p>这是建立职业与财务基线的关键输入，完成后能减少后续计划中的不确定性。</p></div>
            <div className="action-row"><button className="primary-button" disabled={props.busy} onClick={() => props.onToggle(pending.id)}>✓ 完成行动</button><button className="soft-button" onClick={() => props.onNavigate("plan")}>调整今天</button></div>
          </> : <div className="empty-focus"><h2>今天的重点已经完成</h2><p>剩下的时间留给恢复或喜欢的生活。</p></div>}
        </article>
        <article className="week-card">
          <div className="section-heading"><div><span className="eyebrow">本周状态</span><h3>节奏刚刚好</h3></div><span className="capacity-badge">未过载</span></div>
          <div className="ring-row"><div className="progress-ring" style={{ "--progress": `${percentage * 3.6}deg` } as React.CSSProperties}><span><b>{percentage}%</b><small>已完成</small></span></div><div className="week-stats"><p><b>{props.completedActions}/{props.workspace.actions.length}</b><span>重点行动</span></p><p><b>{Math.round(props.completedMinutes / 60 * 10) / 10}h</b><span>已投入 / {Math.round(props.plannedMinutes / 60 * 10) / 10}h</span></p></div></div>
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
        <span className="ai-mark">✦</span><div><span className="eyebrow">基于你的实际容量</span><p>本周计划约 {Math.round(props.plannedMinutes / 6) / 10} 小时，低于你的 7 小时可用时间。先完成职业项目清单，房产资料可以留到第三周。</p></div><button aria-label="查看建议详情">→</button>
      </section>
    </>
  );
}

function OutcomeCard({ item, index }: { item: Outcome; index: number }) {
  const tones = ["stone", "green", "blue", "amber"];
  const labels = ["财务", "健康", "英语", "职业"];
  return <article className="outcome-card"><div className="outcome-head"><span className={`area-pill ${tones[index]}`}>{labels[index]}</span><b>{item.progress}%</b></div><h4>{item.title}</h4><p>{item.acceptance_criteria}</p><div className="progress-bar"><i className={tones[index]} style={{ width: `${item.progress}%` }} /></div></article>;
}

function Journeys({ items, busy, mutate }: { items: Journey[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [filter, setFilter] = useState("全部");
  const areas = ["全部", "健康", "英语", "职业", "财务与资产", "收入", "关系与家庭", "探索与生活"];
  const visible = filter === "全部" ? items : items.filter((item) => item.area === filter);
  const activeCount = items.filter((item) => item.status === "active").length;
  return <>
    <PageHeader kicker="32岁—40岁" title="100次征程"><div className="stage-chip"><span />当前激活 {activeCount}/5</div></PageHeader>
    <div className="filter-row">{areas.map((area) => <button key={area} className={filter === area ? "active" : ""} onClick={() => setFilter(area)}>{area}</button>)}</div>
    <section className="journey-list">
      {visible.map((item) => <article key={item.id} className="journey-row">
        <div className="journey-number">{String(item.sequence_number).padStart(2, "0")}</div>
        <div className="journey-copy"><div><span className={`area-pill ${areaTone[item.area] ?? "stone"}`}>{item.area}</span><span className={`status-text ${item.status}`}>{statusLabel(item.status)}</span></div><h3>{item.title}</h3><p>{item.acceptance_criteria}</p>{item.status === "active" && <small>下一步：{item.next_action}</small>}</div>
        <div className="journey-action">{item.status === "active" ? <><b>{item.progress}%</b><button disabled={busy} onClick={() => mutate({ action: "journey-status", id: item.id, status: "paused" }, "征程已暂停，这不代表失败")}>暂停</button></> : <button disabled={busy} onClick={() => mutate({ action: "journey-status", id: item.id, status: "active" }, "已加入当前阶段")}>激活</button>}</div>
      </article>)}
    </section>
  </>;
}

function statusLabel(status: Journey["status"]) {
  return { active: "进行中", planned: "待开始", paused: "已暂停", completed: "已完成" }[status];
}

function Plan({ outcomes, actions, busy, onToggle }: { outcomes: Outcome[]; actions: Action[]; busy: boolean; onToggle: (id: string) => void }) {
  return <>
    <PageHeader kicker="2026年8月12日—9月11日" title="首月计划"><button className="soft-button">帮我调整计划</button></PageHeader>
    <div className="plan-summary"><div><span>核心成果</span><b>4</b><small>保持少而重要</small></div><div><span>预计投入</span><b>{outcomes.reduce((sum, item) => sum + item.expected_hours, 0)}h</b><small>每周约 7 小时</small></div><div><span>明确不做</span><b>3</b><small>课程、社群、重型副业</small></div></div>
    <section className="plan-layout">
      <div><div className="section-heading"><div><span className="eyebrow">月度成果</span><h3>完成标准清晰，才算真正完成</h3></div></div><div className="plan-outcomes">{outcomes.map((item, index) => <OutcomeCard item={item} index={index} key={item.id} />)}</div></div>
      <div className="weekly-panel"><div className="section-heading"><div><span className="eyebrow">本周重点</span><h3>{actions.filter((item) => item.status === "completed").length}/{actions.length} 已完成</h3></div><span className="capacity-badge">6.3h / 7h</span></div>{actions.map((item) => <label key={item.id} className={item.status === "completed" ? "task-row completed" : "task-row"}><input aria-label={`${item.title}完成状态`} type="checkbox" checked={item.status === "completed"} disabled={busy} onChange={() => onToggle(item.id)} /><span><b>{item.title}</b><small>{item.scheduled_for} · {item.estimated_minutes}分钟</small></span></label>)}</div>
    </section>
  </>;
}

function Records({ items, onCheckin }: { items: Checkin[]; onCheckin: (type: "exercise" | "english") => void }) {
  return <>
    <PageHeader kicker="行动留下痕迹" title="记录"><div className="action-row"><button className="soft-button" onClick={() => onCheckin("exercise")}>＋ 运动</button><button className="soft-button" onClick={() => onCheckin("english")}>＋ 英语</button></div></PageHeader>
    <div className="record-summary"><article><span className="quick-icon exercise">↗</span><div><small>本月运动</small><b>{items.filter((item) => item.type === "exercise").length} <em>/ 12次</em></b></div></article><article><span className="quick-icon english">Aa</span><div><small>本月英语</small><b>{items.filter((item) => item.type === "english").length} <em>/ 12次</em></b></div></article><article><span className="quick-icon finance">¥</span><div><small>财务基线</small><b>25% <em>已完成</em></b></div></article></div>
    <section className="record-list"><div className="section-heading"><div><span className="eyebrow">最近记录</span><h3>每一次行动都在形成证据</h3></div></div>{items.length ? items.map((item) => <article key={item.id}><span className={`record-mark ${item.type}`}>{item.type === "exercise" ? "↗" : "Aa"}</span><div><b>{item.type === "exercise" ? "完成一次运动" : "完成一次英语练习"}</b><p>{item.note || "只记录完成，不给今天增加负担"}</p></div><span><b>{item.duration}分钟</b><small>{new Date(item.created_at).toLocaleDateString("zh-CN")}</small></span></article>) : <div className="empty-list"><b>还没有记录</b><p>今天完成后，10秒留下第一条证据。</p></div>}</section>
  </>;
}

function ReviewPanel({ completedActions, actionTotal, exerciseCount, englishCount, reviews, busy, mutate }: { completedActions: number; actionTotal: number; exerciseCount: number; englishCount: number; reviews: Review[]; busy: boolean; mutate: (payload: Record<string, unknown>, success?: string) => Promise<boolean> }) {
  const [achievement, setAchievement] = useState("");
  const [lowValue, setLowValue] = useState("");
  const [nextPriority, setNextPriority] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate({ action: "review", achievement, lowValue, nextPriority }, "周复盘已保存，下周会以它为起点");
    if (ok) { setAchievement(""); setLowValue(""); setNextPriority(""); }
  }
  return <>
    <PageHeader kicker="把真实生活带回计划" title="本周复盘"><span className="capacity-badge">约 8 分钟</span></PageHeader>
    <div className="review-metrics"><div><span>行动完成</span><b>{completedActions}/{actionTotal}</b></div><div><span>运动次数</span><b>{exerciseCount}</b></div><div><span>英语练习</span><b>{englishCount}</b></div><div><span>负载状态</span><b className="healthy">可持续</b></div></div>
    <section className="review-layout">
      <form className="review-form" onSubmit={submit}><label><span>1 · 本周最重要的成果是什么？</span><textarea required value={achievement} onChange={(event) => setAchievement(event.target.value)} placeholder="记录事实，也记录你真正认可的进展…" /></label><label><span>2 · 哪件事消耗很大但价值较低？</span><textarea value={lowValue} onChange={(event) => setLowValue(event.target.value)} placeholder="可以为空，不必为了复盘制造问题…" /></label><label><span>3 · 下周唯一必须推进的里程碑是什么？</span><textarea required value={nextPriority} onChange={(event) => setNextPriority(event.target.value)} placeholder="只选一件，越具体越好…" /></label><button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "保存本周复盘"}<span>→</span></button></form>
      <aside className="review-draft"><span className="ai-mark">✦</span><span className="eyebrow">复盘助手草稿</span><h3>先看数据，再做判断</h3><div><b>客观数据</b><p>本周完成 {completedActions}/{actionTotal} 项重点，记录运动 {exerciseCount} 次、英语 {englishCount} 次。</p></div><div><b>AI 推测</b><p>{completedActions < actionTotal / 2 ? "当前计划可能仍然偏多，需要继续缩小范围。" : "当前计划容量基本合理，可以保持节奏。"}</p></div><small>推测不是事实，请结合你的真实感受确认。</small>{reviews[0] && <div className="last-review"><b>最近一次决定</b><p>{reviews[0].next_priority}</p></div>}</aside>
    </section>
  </>;
}

function CheckinDialog({ type, busy, onClose, onSubmit }: { type: "exercise" | "english"; busy: boolean; onClose: () => void; onSubmit: (duration: number, note: string) => void }) {
  const [duration, setDuration] = useState(type === "exercise" ? 45 : 30);
  const [note, setNote] = useState("");
  const label = type === "exercise" ? "运动" : "英语";
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" onClick={onClose} aria-label="关闭">×</button><span className={`record-mark ${type}`}>{type === "exercise" ? "↗" : "Aa"}</span><span className="eyebrow">快速记录</span><h2 id="dialog-title">完成一次{label}</h2><p>先留下完成证据，细节以后也可以补充。</p><label><span>投入时间</span><div className="duration-row">{[20, 30, 45, 60].map((value) => <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(value)}>{value}分钟</button>)}</div></label><label><span>一句备注（可选）</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={type === "exercise" ? "今天身体感觉如何？" : "今天练习了什么？"} /></label><button className="primary-button full" disabled={busy} onClick={() => onSubmit(duration, note)}>{busy ? "正在保存…" : "记录完成"}</button></section></div>;
}
