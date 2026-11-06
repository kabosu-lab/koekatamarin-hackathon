"use client";

import Link from "next/link";
import { type FormEvent, Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Review } from "@/lib/claude/compose";
import type { DraftStreamEvent } from "@/lib/compose-request";
import type { ChatMessage } from "@/lib/claude/types";
import type { ChannelView, PersonView } from "@/lib/destination/types";
import type { KnowledgeResult } from "@/lib/knowledge";
import { PROMISE_FULL, PROMISE_SHORT, promiseCookieName } from "@/lib/promise-cookie";
import { TRIAL_PROMISE_SHORT } from "@/lib/trial";
import { useKeepsWords, useTrial } from "./TrialContext";
import { HeardLine } from "./HeardLine";
import { PartnerGreeting, usePartnerInvite } from "./PartnerGreeting";
import { usePartnerTap } from "./partner-tap";
import { inviteLine, nextPartnerLine, partnerHour, type PartnerLine } from "@/lib/partner-lines";
import { useRouter } from "next/navigation";
import { WheelCarousel, type WheelCarouselHandle } from "./WheelCarousel";
import type { ChipItem } from "./Chip";
import { isCancelPoint } from "@/lib/wheel-carousel";
import { BottomSheet } from "./BottomSheet";
import { PartnerIcon } from "./PartnerIcon";
import { KnowledgeResults } from "./chie/KnowledgeResults";
import { Compose, type ComposeSend, type ComposeStart } from "./Compose";
import { ConnectCard, type ConnectSuggestion } from "./ConnectCard";
import { SafetyCard, type SafetyNotice } from "./SafetyCard";
import { AttachmentPreview } from "./AttachmentPreview";
import { Avatar } from "./Avatar";
import { playSendSound, SendBurst } from "./SendBurst";
import { audioOutput, playCommitPop, playReadyChord } from "./sound";
import { raiseLevel, type DeliverLevel } from "@/lib/send-sound";
import type { AttachmentView } from "@/lib/attachment";
import { archiveTalk, loadArchive, loadTalk, saveTalk } from "./talk-storage";
import { isSpeechSupported, type ListeningSession, SLOW_NOTICE, startSession } from "./speech";
import { useLockedTalk } from "./use-locked-talk";
import { Icon } from "./Icon";
import { postFeedback } from "./FeedbackSheet";
import { isFeedbackConsent } from "@/lib/feedback-consent";
import { ClickWheel } from "./ClickWheel";
import { ReplyToast } from "./ReplyToast";
import { VoiceLump } from "./VoiceLump";
import type { ReplyNotice } from "@/lib/reply-notices";
import type { LumpShapeName } from "@/lib/lump-shapes";
import type { TeamsDelivery } from "@/lib/destination/teams-bridge";

const MAX_TEXT_LENGTH = 2000;
/** 本人がこれだけ話したら「とどける」を目立たせる。話の中身は見ない */
/** これより短い押し方は触っただけとして、聞いた言葉を送らない */
const MIN_HOLD_MS = 300;
/** 押したまま、これだけ上へ動かすと固定になる */
const LOCK_DISTANCE_PX = 56;
/** 歩きながら話す間は黙っていることもあるので、長めに待つ */
const LISTEN_SILENCE_LIMIT_MS = 10 * 60 * 1000;
/**
 * 0-1g(3)：輪をなぞると出るチップ。「話す」画面からは左右にスワイプしないと行けない場所。
 * 同じ入口を2か所に置かない決まりに合わせ、ここに並べるのは画面の行き先だけ。
 */
const WHEEL_CHIPS: (ChipItem & { href: string })[] = [
  { id: "minna", label: "みんな", code: "M-01", icon: "people", href: "/minna" },
  { id: "today", label: "今日の3人", code: "T-03", icon: "heart", href: "/today" },
  { id: "inbox", label: "受信箱", code: "I-02", icon: "inbox", href: "/inbox" },
  { id: "room", label: "自習室（一緒に勉強する）", code: "S-04", icon: "book", href: "/study/room" },
  { id: "chie", label: "校内の知恵", code: "K-05", icon: "idea", href: "/chie" },
  { id: "goals", label: "頑張りたいこと", code: "G-06", icon: "flag", href: "/me?open=goals" },
  { id: "daily", label: "日報・日記", code: "D-07", icon: "note", href: "/me?open=daily" },
  { id: "lookback", label: "ふりかえり", code: "L-08", icon: "clock", href: "/me?open=lookback" },
  { id: "settings", label: "設定", code: "C-09", icon: "settings", href: "/me?open=settings" },
];
const MAX_HISTORY = 40;
/** 話の途中で声をかけないよう、少なくとも2往復してから確かめる */
const CONNECT_MIN_MESSAGES = 4;

/** 送った結果を正直に伝える。本物の Teams に届いていないのに「届きました」と言わない。 */
export function deliveryText(channelName: string, teams?: TeamsDelivery): string {
  switch (teams?.state) {
    case "sent":
      return `Teams の${channelName}にも届きました。`;
    case "pending":
      return "こえかたに残しました。Teams へは確認中です。";
    case "failed":
      return "こえかたに残しました。Teams へは届いていません（つながりませんでした）。";
    case "skipped":
      if (teams.reason === "scope") return "こえかたに残しました。範囲を絞った投稿は Teams へ送りません。";
      if (teams.reason === "signin") return "こえかたに残しました。Teams へは届いていません（この人はサインインしていません）。";
      if (teams.reason === "unlinked") return "こえかたに残しました。このチャネルは Teams につないでいません。";
      if (teams.reason === "refresh")
        return `こえかたに残しました。Teams へは届いていません（サインインの更新を、組織のセキュリティの設定に止められました${teams.code ? `。${teams.code}` : ""}）。`;
      return "こえかたに残しました。この投稿は校内だけに届きます。";
    default:
      return `${channelName}に届きました。`;
  }
}

export function Talk({
  viewer,
  question,
  initialAsk = null,
  viewerId,
  promiseSeen = false,
  avatarImage,
  initialGoal = null,
  device = false,
  notices = [],
  noticePollMs = 30_000,
  companionAlt,
  companionColor,
  companionShape,
  companionImage,
}: {
  viewer: { name: string; label: string; role?: string };
  question: string | null;
  initialAsk?: { id: string; name: string } | null;
  viewerId: string;
  promiseSeen?: boolean;
  avatarImage?: string;
  /** 頑張りたいことを乗り越えて「みんなに言っておく」で来たとき */
  initialGoal?: { id: string; text: string } | null;
  /** 窓とホイールの配置 */
  device?: boolean;
  /** 開いたときに届いている返事 */
  notices?: ReplyNotice[];
  noticePollMs?: number;
  /** 窓に出すパートナーの名前。報酬を隠している人にはない */
  companionAlt?: string;
  /** 声のかたまりの色 */
  companionColor?: string;
  companionShape?: LumpShapeName;
  /** 育って動物になったら、その絵 */
  companionImage?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [listening, setListening] = useState(false);
  // 0-1l：新しく話すと、大きな姿が戻ってくる（戻る動きを一度だけ見せる）
  const [returning, setReturning] = useState(false);
  // 0-1l：新しく話す前の話。話す画面の会話を上へたどると読める（話の履歴のタイルはなくした）
  const [archived, setArchived] = useState<ChatMessage[][]>([]);
  useEffect(() => setArchived(loadArchive(viewer.name)), [viewer.name]);
  // 0-2a：パートナーの話しかけ。Claude は呼ばず、時刻・立場・頑張りたいことで手元の一覧から選ぶ
  const lineBase = { role: (viewer.role ?? "teacher") as "student" | "teacher" | "admin", firstTime: !promiseSeen, goal: initialGoal?.text ?? null };
  const [tapCount, setTapCount] = useState(0);
  const [recentLines, setRecentLines] = useState<string[]>([]);
  const [line, setLine] = useState<PartnerLine>(() =>
    question ? { text: question, kind: "ask" } : nextPartnerLine({ ...lineBase, hour: partnerHour(new Date()), tapCount: 0 }),
  );
  const [greetingTyped, setGreetingTyped] = useState(false);
  const partnerTap = usePartnerTap(messages.length > 0);
  const invite = usePartnerInvite({ typed: greetingTyped, spoken: messages.length > 0 || listening || draft.trim() !== "" });
  // 数秒触られなければ、操作の案内をそっと添える（0-1g(2)）。一度話したら出さない
  useEffect(() => {
    if (invite.nudge && messages.length === 0) setLine({ text: inviteLine(lineBase.role), kind: "guide" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.nudge]);
  const [heard, setHeard] = useState("");
  // 電波が弱くて文字がまとめて届いても、少しずつなめらかに出す
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [scripted, setScripted] = useState(false);
  const [composing, setComposing] = useState<ComposeStart | null>(null);
  // シートを閉じても下書き（composing）は残し、とどけるでもう一度開くと続きから
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [safety, setSafety] = useState<SafetyNotice | null>(null);
  const [suggestion, setSuggestion] = useState<ConnectSuggestion | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [remembered, setRemembered] = useState<number[]>([]);
  const [askTarget, setAskTarget] = useState(initialAsk);
  const trial = useTrial();
  const keepsWords = useKeepsWords();
  // 試用では、試用版の注意のカード（TrialNotice）が最初の1回を受け持つので、ここでは出さない
  const [acknowledged, setAcknowledged] = useState(promiseSeen || trial);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<KnowledgeResult[] | null>(null);
  const [goalSuggestion, setGoalSuggestion] = useState<string | null>(null);
  const [goalDone, setGoalDone] = useState<{ id: string; text: string } | null>(null);
  const [goalForPost, setGoalForPost] = useState<{ id: string; text: string } | null>(initialGoal);
  const goalAsked = useRef(false);
  const connectDone = useRef(false);
  // 送ったあとに話した分だけで、次を目立たせるか決める
  const [deliveredAt, setDeliveredAt] = useState(0);
  // 0-1g(5)：とどけるの光の段（1〜3）。上がるだけで、届けたら0に戻る
  const [level, setLevel] = useState<DeliverLevel>(0);
  const levelRef = useRef<DeliverLevel>(0);
  // 0-1g(4)：声が固まるたびに上がるポンの段。届けたら最初に戻る
  const popStep = useRef(0);
  /** パートナーが「投稿にできる要素がそろった」と判断した時点の会話の長さ */
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState<{ channel: ChannelView; postId: string; isPublic: boolean; teams?: TeamsDelivery } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<WheelCarouselHandle>(null);
  const router = useRouter();
  const pressedAt = useRef<number | null>(null);
  const discardHeard = useRef(false);
  const pressY = useRef<number | null>(null);
  const pressX = useRef<number | null>(null);
  /** 押したまま上へずらした割合（0〜1）。押していないときは null */
  const [lift, setLift] = useState<number | null>(null);
  // 固定にした指を離したときの押した扱いを、止める操作と取り違えない
  const justLocked = useRef(false);
  const sessionRef = useRef<ListeningSession | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  /** 0-2h：パートナーが作っている人に届けてよいか聞いた、本人の言葉（試用版だけ） */
  const askedFeedback = useRef<string | null>(null);
  const lockedTalk = useLockedTalk({
    session: sessionRef,
    history: () => messagesRef.current.slice(-MAX_HISTORY),
    onSafety: setSafety,
    polite: viewer.role !== undefined && viewer.role !== "student",
    onExchange: (asked, reply, ready) =>
      setMessages((current) => {
        const updated: ChatMessage[] = [...current, { role: "user", content: asked }, { role: "assistant", content: reply }];
        // 歩きながらでも、光ったことは画面に残す（送るのは画面で確かめてから）
        if (ready) setReadyAt(updated.length);
        return updated;
      }),
  });
  // 声が確定したときは、そのときの会話と入力欄で送る
  const latest = useRef({ send: (_text: string) => {}, draft: "" });

  useEffect(() => {
    // 液晶の配置では、やり取りは枠の中だけで動かし、画面全体は動かさない
    if (device) {
      // 0-1l：新しいものが下に足されたら末尾へ。ただし最新の吹き出しが窓より高いときは、その頭に合わせる（文の途中から始めない）
      const log = logRef.current;
      if (log) {
        const frame = requestAnimationFrame(() => {
          // いちばん下に足されたもの（吹き出しか、送った結果などのカード）
          const items = Array.from(log.children).filter((child) => !child.classList.contains("find-knowledge")) as HTMLElement[];
          const last = items[items.length - 1];
          if (last && last.offsetHeight > log.clientHeight - 8 && !last.classList.contains("me")) {
            log.scrollTop += last.getBoundingClientRect().top - log.getBoundingClientRect().top - 4;
          } else log.scrollTop = log.scrollHeight;
        });
        return () => cancelAnimationFrame(frame);
      }
      return;
    }
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [device, messages, sending, heard, safety, suggestion, goalSuggestion, goalDone, found, notice, sentTo, attachment]);

  useEffect(() => () => stopRef.current?.(), []);

  // 画面を行き来しても話が消えないよう、このタブの中だけに残す。サーバーには保存しない
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) {
      saveTalk(viewer.name, messages);
      return;
    }
    restored.current = true;
    const saved = loadTalk(viewer.name);
    const goalLine = initialGoal ? `頑張りたいことの「${initialGoal.text}」ができた！` : null;
    const withGoal: ChatMessage[] =
      goalLine && saved.at(-1)?.content !== goalLine ? [...saved, { role: "user", content: goalLine }] : saved;
    if (withGoal.length > 0) setMessages(withGoal);
  }, [messages, viewer.name]);

  function rememberPromiseSeen() {
    document.cookie = `${promiseCookieName(viewerId)}=1; path=/; max-age=31536000; samesite=lax`;
  }

  async function send(raw: string) {
    rememberPromiseSeen();
    const text = raw.trim();
    if (!text || sending) return;

    const history = messages.slice(-MAX_HISTORY);
    // 0-2h：パートナーが「作っている人に届けてもいい？」と聞いたあと、本人がいいと言ったら、その前の本人の言葉だけを届ける
    const askedAbout = askedFeedback.current;
    askedFeedback.current = null;
    if (trial && askedAbout && isFeedbackConsent(text)) void postFeedback({ body: askedAbout, from: "talk" }, window.location.pathname);
    setMessages([...messages, { role: "user", content: text }]);
    setDraft("");
    setNotice("");
    setSending(true);
    try {
      const response = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, text }),
      });
      const { reply, mode, ready, level: incoming, safety: notice, feedback } = (await response.json().catch(() => ({}))) as {
        reply?: string;
        mode?: string;
        ready?: boolean;
        level?: number;
        safety?: SafetyNotice;
        feedback?: boolean;
      };
      // 届けてよいか聞かれた言葉を覚えておく（次の本人の返事で決める）。命や安全の案内のときは預からない
      if (trial && feedback === true && !notice && response.ok && reply) askedFeedback.current = text;
      // 返事が作れなくても、相談室に伝えたことは必ず本人に知らせる
      if (notice) setSafety(notice);
      if (!response.ok || !reply) throw new Error(`status ${response.status}`);
      const updated: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ];
      setMessages(updated);
      setScripted(mode === "scripted");
      // パートナーが「投稿にできる要素がそろった」と判断したら、とどけるを光らせる。命や安全の案内のときは光らせない
      if (ready === true && !notice) setReadyAt(updated.length);
      // 段は上がるだけ。上がった瞬間だけ締めの和音を鳴らす。命や安全の案内のときは上げない
      if (!notice) {
        const next = raiseLevel(levelRef.current, incoming ?? (ready === true ? 1 : 0));
        if (next > levelRef.current) playReadyChord(next);
        levelRef.current = next;
        setLevel(next);
      }
      // 命や安全の案内が出ているときは、人の紹介をしない
      if (notice) connectDone.current = true;
      void checkConnect(updated);
      if (!notice) void checkGoals(updated);
    } catch {
      // 話した言葉を失わないよう、書く欄に戻す
      setMessages(messages);
      setDraft(text);
      setWriting(true);
      setNotice("つながりませんでした。言葉は残してあるので、もう一度送ってください。");
    } finally {
      setSending(false);
    }
  }

  async function checkConnect(history: ChatMessage[]) {
    if (connectDone.current || history.length < CONNECT_MIN_MESSAGES) return;
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(-MAX_HISTORY) }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { suggestion: ConnectSuggestion | null };
      if (body.suggestion && !connectDone.current) {
        // 売り込まないよう、1回の会話で声をかけるのは1度だけ
        connectDone.current = true;
        setSuggestion(body.suggestion);
      }
    } catch {
      // 声かけは無くても困らないので、黙って見送る
    }
  }

  // 話の中に頑張りたいことや「できた」があれば聞く。残すかは本人が押して決める
  async function checkGoals(history: ChatMessage[]) {
    try {
      const response = await fetch("/api/goals/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(-MAX_HISTORY) }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { suggestion: string | null; done: { id: string; text: string } | null };
      if (body.done) setGoalDone(body.done);
      else if (body.suggestion && !goalAsked.current) {
        // 売り込まないよう、1回の会話で聞くのは1度だけ
        goalAsked.current = true;
        setGoalSuggestion(body.suggestion);
      }
    } catch {
      // 声かけは無くても困らないので、黙って見送る
    }
  }

  async function saveGoal(body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok) setNotice("残せませんでした。もう一度押してください。");
    return response?.ok === true;
  }

  /** 下書きの流れの世代。取り消しや作り直しのあと、古い流れが新しい下書きに混ざらないようにする */
  const composeRun = useRef(0);
  const [composeKey, setComposeKey] = useState(0);

  function stopCompose() {
    composeRun.current += 1;
    setPreparing(false);
  }

  // 0-2l：押した瞬間にシートを開き、見出しと Teams の見え方を先に出す。本文は流れてくるそばから書く
  async function startCompose(asked?: { id: string; name: string }, goal = goalForPost) {
    const run = ++composeRun.current;
    const live = () => composeRun.current === run;
    setPreparing(true);
    setNotice("");
    setSentTo(null);
    setComposeKey((key) => key + 1);
    setComposing({
      draft: { ready: false, text: "", channelId: "", kind: "report", researchedWithAi: false },
      review: null,
      writing: true,
      channels: [],
      people: [],
      asked,
      goalId: goal?.id,
      attachment: attachment ? { ...attachment, notices: [] } : undefined,
    });
    setSheetOpen(true);
    const update = (change: (current: ComposeStart) => ComposeStart) => {
      if (live()) setComposing((current) => (current ? change(current) : current));
    };
    const fail = (message: string) => {
      if (!live()) return;
      stopCompose();
      setSheetOpen(false);
      setComposing(null);
      setNotice(message);
    };
    let drafted = false;
    try {
      const response = await fetch("/api/draft/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages.slice(-MAX_HISTORY), askedPersonId: asked?.id, attachmentId: attachment?.id }),
      });
      if (!response.ok || !response.body) throw new Error(`status ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (event: DraftStreamEvent) => {
        if (event.type === "start") {
          update((current) => ({ ...current, channels: event.channels, people: event.people, attachment: event.attachment ?? current.attachment }));
        } else if (event.type === "channel") {
          update((current) => ({ ...current, draft: { ...current.draft, channelId: event.channelId } }));
        } else if (event.type === "delta") {
          update((current) => ({ ...current, draft: { ...current.draft, text: current.draft.text + event.text } }));
        } else if (event.type === "draft") {
          drafted = true;
          if (!event.draft.ready) {
            fail("まだ投稿にできるお話がなさそう。もう少し聞かせてください。");
            return;
          }
          if (live()) setSuggestion(null);
          update((current) => ({
            ...current,
            draft: event.draft,
            writing: false,
            attachment: current.attachment && event.notices ? { ...current.attachment, notices: event.notices } : current.attachment,
          }));
        } else if (event.type === "review") {
          update((current) => ({ ...current, review: event.review }));
        } else {
          fail("下書きを作れませんでした。もう一度押してください。");
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (!live()) {
          void reader.cancel().catch(() => {});
          return;
        }
        if (value) buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (line) handle(JSON.parse(line) as DraftStreamEvent);
        }
        if (done) break;
      }
      if (!drafted) throw new Error("stream ended");
    } catch {
      fail("下書きを作れませんでした。もう一度押してください。");
    } finally {
      if (live()) setPreparing(false);
    }
  }

  // 0-2l(2)：「本人として送る」は押した瞬間に送ったあとの動きを始め、送信は裏で進める。失敗したときだけ、あとから知らせる
  function sendInBackground(start: ComposeStart, { channel, words, isPublic, review, body }: ComposeSend) {
    stopCompose();
    setSheetOpen(false);
    setComposing(null);
    setSentTo(null);
    setNotice("");
    setDeliveredAt(messages.length);
    // 届けたら、光の段もポンの段も最初に戻す
    levelRef.current = 0;
    setLevel(0);
    popStep.current = 0;
    setBurst(words);
    playSendSound(words);
    void (async () => {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      const data = ((await response?.json().catch(() => null)) ?? {}) as { postId?: string; teams?: TeamsDelivery; error?: string; review?: Review };
      if (response?.ok && typeof data.postId === "string") {
        setSentTo({ channel, postId: data.postId, isPublic, teams: data.teams });
        setGoalForPost(null);
        setAttachment(null);
        return;
      }
      // 下書きは、本人が直した言葉と送り先のまま残す。とどけるで開き直して、もう一度送れる
      setComposeKey((key) => key + 1);
      setComposing({
        ...start,
        writing: false,
        draft: { ...start.draft, text: words, channelId: channel.id },
        review: response?.status === 422 && data.review ? data.review : review,
      });
      setNotice(
        response?.status === 422
          ? "この内容は送れませんでした。とどけるから開いて、言い方を一緒に考えましょう。"
          : response?.status === 400 && data.error
            ? `まだ届いていません。${data.error} 下書きは残してあります。`
            : "まだ届いていません。下書きは残してあります。とどけるから、もう一度送ってください。",
      );
    })();
  }

  // 押したときだけ探す。話した言葉はこの呼び出しの中だけで使い、保存しない
  async function findKnowledge() {
    setFinding(true);
    setNotice("");
    try {
      const query = messages
        .filter((message) => message.role === "user")
        .slice(-3)
        .map((message) => message.content)
        .join("\n")
        .slice(0, MAX_TEXT_LENGTH);
      const response = await fetch("/api/chie/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { results: KnowledgeResult[] };
      setFound(body.results);
    } catch {
      setNotice("探せませんでした。もう一度押してください。");
    } finally {
      setFinding(false);
    }
  }

  // 話しただけのことは、本人が頼んだものだけを残す
  async function remember(index: number, text: string) {
    setNotice("");
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remember", text }),
    }).catch(() => null);
    if (response?.ok) setRemembered((current) => [...current, index]);
    else setNotice("覚えられませんでした。もう一度押してください。");
  }

  async function undoSent() {
    if (!sentTo) return;
    setNotice("");
    const response = await fetch("/api/publish/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: sentTo.postId }),
    }).catch(() => null);
    if (response?.ok) {
      setSentTo(null);
      const { teamsKept } = (await response.json().catch(() => ({}))) as { teamsKept?: boolean };
      setNotice(teamsKept ? "こえかたでは取り消しました。Teams に届いた分は、Teams で消してください。" : "取り消しました。言葉はもう一度作り直せます。");
    } else {
      setNotice("もう取り消せません（返信が付いたか、時間が過ぎました）。");
    }
  }

  function listen() {
    setNotice("");
    if (!isSpeechSupported()) {
      setWriting(true);
      setNotice("このブラウザでは声が使えません。文字で書いてください。");
      return;
    }
    discardHeard.current = false;
    setHeard("");
    setListening(true);
    const session = startSession({
      onInterim: (text) => {
        // 文字が届いたら、電波の知らせは消す
        setNotice((current) => (current === SLOW_NOTICE ? "" : current));
        setHeard(text);
        lockedTalk.heard(text);
      },
      // 話し終えたら、押さなくてもパートナーへ送る。Teams へ届けるのは本人が確かめて押す
      onFinal: (text) => {
        const rest = lockedTalk.finish(text).trim();
        if (discardHeard.current || !rest) return;
        const typed = latest.current.draft.trim();
        latest.current.send(typed ? `${typed}\n${rest}` : rest);
      },
      // 0-1g(4)：声が1区切り固まるたびに、やわらかいポン。音階が1段ずつ上がる
      onCommitted: () => {
        popStep.current += 1;
        playCommitPop(popStep.current);
      },
      onError: setNotice,
      onEnd: () => {
        setListening(false);
        setHeard("");
        stopRef.current = null;
        sessionRef.current = null;
        // 言葉があれば、このあとすぐ onFinal が呼ばれる。そのあとで固定を解く
        queueMicrotask(() => lockedTalk.finish(""));
      },
    }, { silenceLimitMs: LISTEN_SILENCE_LIMIT_MS });
    sessionRef.current = session;
    stopRef.current = () => session.stop();
  }

  async function attach(file: File) {
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/attachments", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as AttachmentView & { error?: string };
      if (!response.ok) {
        setNotice(body.error ?? "付けられませんでした。もう一度選んでください。");
        return;
      }
      setAttachment({ id: body.id, mediaType: body.mediaType, fileName: body.fileName });
    } catch {
      setNotice("付けられませんでした。もう一度選んでください。");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment() {
    if (!attachment) return;
    const { id } = attachment;
    setAttachment(null);
    await fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function pressMic() {
    if (listening) {
      pressedAt.current = null;
      return;
    }
    pressedAt.current = isSpeechSupported() ? Date.now() : null;
    listen();
  }

  /** 押したまま上下左右のどの向きへずらしても固定にする（0-1h）。指を離しても聞き続ける。 */
  function moveMic(x: number, y: number) {
    if (pressY.current === null || pressX.current === null || pressedAt.current === null) return;
    const distance = Math.hypot(x - pressX.current, y - pressY.current);
    setLift(Math.max(0, Math.min(1, distance / LOCK_DISTANCE_PX)));
    if (distance < LOCK_DISTANCE_PX) return;
    setLift(null);
    pressedAt.current = null;
    pressY.current = null;
    pressX.current = null;
    justLocked.current = true;
    lockedTalk.lock();
  }

  function releaseMic() {
    setLift(null);
    pressY.current = null;
    const started = pressedAt.current;
    pressedAt.current = null;
    if (started === null) return;
    // 触っただけなら聞いた言葉は捨てて、使い方を短く伝える
    if (Date.now() - started < MIN_HOLD_MS) {
      discardHeard.current = true;
      setNotice("押し続けて話す");
    }
    stopRef.current?.();
  }

  function enterToSend(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 漢字の変換を決めるときの Enter では送らない
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send(draft);
  }

  latest.current = { send: (text) => void send(text), draft };

  // 0-1o：下書きの確認。話す画面では下からせり上がるシートに入れ、話す画面は暗く沈めて残す
  const closeSheet = () => setSheetOpen(false);
  const composeView = composing && (
    <Compose
      key={composeKey}
      {...composing}
      viewer={viewer}
      onCancel={() => {
        stopCompose();
        setSheetOpen(false);
        setComposing(null);
      }}
      onSendStart={(send) => sendInBackground(composing, send)}
      onReplaceAttachment={() => {
        stopCompose();
        setSheetOpen(false);
        void removeAttachment();
        setComposing(null);
        setNotice("撮り直したものや別のファイルを、もう一度付けてください。");
      }}
      onSent={(channel, postId, words, isPublic, teams) => {
        setSheetOpen(false);
        setComposing(null);
        setSentTo({ channel, postId, isPublic, teams });
        setDeliveredAt(messages.length);
        // 届けたら、光の段もポンの段も最初に戻す
        levelRef.current = 0;
        setLevel(0);
        popStep.current = 0;
        setGoalForPost(null);
        setAttachment(null);
        setBurst(words);
        playSendSound(words);
      }}
    />
  );

  if (composing && !device) {
    return (
      <div className="talk" data-viewer={viewer.name}>
        {composeView}
      </div>
    );
  }

  const canCompose = messages.some((message) => message.role === "user");
  const hasTyped = draft.trim() !== "";
  // 前に届けたあとで、パートナーがそろったと判断したときだけ光る
  const readyToDeliver = !hasTyped && !listening && !sending && !preparing && readyAt !== null && readyAt > deliveredAt && readyAt <= messages.length;
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  // いちばん新しいパートナーの言葉は、パートナーから出る吹き出しにする
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf("assistant");
  const replyCount = messages.filter((message) => message.role === "assistant").length;

  // 0-1l：話す画面の窓は LINE のような会話。左にアイコン付きのパートナー、右に自分。最新の言葉は頭から全部見える
  const icon = <PartnerIcon image={companionImage} color={companionColor} shape={companionShape} />;
  const companionFigure = companionImage ? (
    <div className="dolphin" data-state={listening ? "listening" : sending ? "thinking" : "idle"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dolphin-still" src={companionImage} alt={companionAlt} />
    </div>
  ) : (
    <VoiceLump alt={companionAlt ?? ""} color={companionColor} shape={companionShape} state={listening ? "listening" : sending ? "thinking" : "idle"} replyCount={replyCount} />
  );
  /** パートナーを触る。話す前は一言が次へ替わり、会話のあとは弾むだけ（0-2a (5)） */
  function tapPartner() {
    partnerTap.onTap();
    if (messages.length > 0) return;
    const recent = [...recentLines, line.text].slice(-3);
    setRecentLines(recent);
    setLine(nextPartnerLine({ ...lineBase, hour: partnerHour(new Date()), tapCount: tapCount + 1, recent }));
    setTapCount(tapCount + 1);
  }
  const chatList = (
    <>
      {messages.map((message, index) =>
        message.role === "assistant" ? (
          <div className="chat-row partner" key={index} data-index={index}>
            {messages[index - 1]?.role === "assistant" ? (
              <span className="chat-icon chat-icon-space" aria-hidden="true" />
            ) : (
              <span className="chat-icon" aria-hidden="true" data-react={index === lastAssistantIndex ? (partnerTap.reaction ?? undefined) : undefined} onClick={tapPartner} onAnimationEnd={partnerTap.onAnimationEnd}>
                {icon}
              </span>
            )}
            <p className="bubble assistant">
              <span className="visually-hidden">パートナー：</span>
              {message.content}
            </p>
          </div>
        ) : (
          <div className="chat-row me" key={index} data-index={index}>
            <p className="bubble user">
              <span className="visually-hidden">あなた：</span>
              {message.content}
            </p>
            {keepsWords && index === lastUserIndex && (
              <button type="button" className="remember" disabled={remembered.includes(index)} onClick={() => void remember(index, message.content)}>
                {remembered.includes(index) ? "覚えました" : "これを覚えて"}
              </button>
            )}
          </div>
        ),
      )}
      {sending && (
        <div className="chat-row partner" data-index={messages.length}>
          <span className="chat-icon chat-icon-thinking" aria-hidden="true">
            {icon}
          </span>
          <p className="bubble assistant waiting" role="status">
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="visually-hidden">考えています…</span>
          </p>
        </div>
      )}
    </>
  );

  const bubbleList = (
    <>
        {messages.map((message, index) => (
          <Fragment key={index}>
            <p className={`bubble ${message.role}${index === lastAssistantIndex && !sending ? " latest" : ""}`}>
              <span className="visually-hidden">{message.role === "user" ? "あなた：" : "パートナー："}</span>
              {message.content}
            </p>
            {device && index === lastAssistantIndex && !sending && <span className="speech-tail" aria-hidden="true" />}
            {keepsWords && message.role === "user" && (!device || index === lastUserIndex) && (
              <button
                type="button"
                className="remember"
                disabled={remembered.includes(index)}
                onClick={() => void remember(index, message.content)}
              >
                {remembered.includes(index) ? "覚えました" : "これを覚えて"}
              </button>
            )}
          </Fragment>
        ))}
    </>
  );

  const cards = (
    <>
      {suggestion && (
        <ConnectCard
          suggestion={suggestion}
          busy={preparing}
          onAccept={() => void startCompose({ id: suggestion.personId, name: suggestion.name })}
          onDecline={() => setSuggestion(null)}
        />
      )}

      {goalSuggestion && (
        <section className="connect-card" aria-label="頑張りたいことの提案">
          <p>これ、頑張りたいことにしておく？</p>
          <p className="person">{goalSuggestion}</p>
          <div className="connect-actions">
            <button
              type="button"
              onClick={() => {
                const text = goalSuggestion;
                setGoalSuggestion(null);
                void saveGoal({ action: "add", text }).then((ok) => ok && setNotice("頑張りたいことに残しました。「履歴と設定」で直したり消したりできます。"));
              }}
            >
              しておく
            </button>
            <button type="button" className="secondary" onClick={() => setGoalSuggestion(null)}>
              今はいい
            </button>
          </div>
        </section>
      )}

      {goalDone && (
        <section className="connect-card" aria-label="頑張りたいことができた">
          <p>「{goalDone.text}」、できたんだね！みんなに言っておく？</p>
          <div className="connect-actions">
            <button
              type="button"
              disabled={preparing}
              onClick={() => {
                const goal = goalDone;
                setGoalDone(null);
                void saveGoal({ action: "done", id: goal.id }).then((ok) => {
                  if (!ok) return;
                  setGoalForPost(goal);
                  void startCompose(askTarget ?? undefined, goal);
                });
              }}
            >
              みんなに言っておく
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const goal = goalDone;
                setGoalDone(null);
                void saveGoal({ action: "done", id: goal.id });
              }}
            >
              自分だけでいい
            </button>
            <button type="button" className="secondary" onClick={() => setGoalDone(null)}>
              まだ途中
            </button>
          </div>
        </section>
      )}

      {goalForPost && (
        <p className="sent" role="status">
          「{goalForPost.text}」、やったね！「{device ? "とどける" : "言葉にして送る"}」で、校内のみんなに伝えられます。
        </p>
      )}

      {safety && <SafetyCard key={safety.alertId} notice={safety} />}

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      {scripted && <p className="scripted">いまは台本で動いています（Claude にはつながっていません）</p>}

      {sentTo && (
        <p className="sent" role="status">
          {deliveryText(sentTo.channel.name, sentTo.teams)}<Link href={`/teams?channel=${sentTo.channel.id}`}>校内チャネルで見る</Link>
          <button type="button" className="undo" onClick={() => void undoSent()}>
            送ったものを取り消す
          </button>
        </p>
      )}

      {askTarget && (
        <p className="sent" role="status">
          {askTarget.name}さんに聞いてみましょう。話したら「{device ? "とどける" : "言葉にして送る"}」で、{askTarget.name}さんへのお願いになります。
          <button type="button" className="undo" onClick={() => setAskTarget(null)}>
            やめる
          </button>
        </p>
      )}

      {found && (
        <section className="chie-card" aria-label="校内の知恵">
          <h2>校内の知恵</h2>
          {found.length === 0 ? (
            <p>今は近いものが見つかりませんでした。</p>
          ) : (
            <KnowledgeResults
              results={found}
              viewerName={viewer.name}
              onAsk={(person) => {
                setAskTarget(person);
                setFound(null);
              }}
            />
          )}
        </section>
      )}
    </>
  );

  // 最初の約束は、窓の中ではなく画面の真ん中のカードで出す。どの幅でもスクロールなしで全部読める
  const promiseCard = acknowledged ? null : (
    <div className="first-card-backdrop">
      <section className="promise promise-card first-card" role="dialog" aria-modal="true" aria-label="最初にお伝えすること">
        <p>{PROMISE_FULL}</p>
        <button
          type="button"
          autoFocus
          onClick={() => {
            // iOS は最初のタップまで音を出せない。このタップで音の準備をする（0-1v）
            audioOutput();
            rememberPromiseSeen();
            setAcknowledged(true);
          }}
        >
          わかった
        </button>
      </section>
    </div>
  );

  if (device) {
    return (
      <div
        className="talk device"
        data-viewer={viewer.name}
        data-state={listening ? "listening" : sending ? "thinking" : "idle"}
        data-talking={messages.length > 0 || sending}
        data-returning={returning || undefined}
      >
        {burst && <SendBurst words={burst} avatarImage={avatarImage} onDone={() => setBurst(null)} />}
        {promiseCard}
        <BottomSheet open={sheetOpen && composing !== null} onClose={closeSheet} label="こんな言葉でどうかな？">
          {composeView}
        </BottomSheet>
        <section className="lcd" aria-label="パートナーの画面">
          <WheelCarousel
            ref={carouselRef}
            items={WHEEL_CHIPS}
            onOpen={(item) => {
              const chip = WHEEL_CHIPS.find((candidate) => candidate.id === item.id);
              if (chip) router.push(chip.href);
            }}
          />
          <ReplyToast initial={notices} paused={listening} pollMs={noticePollMs} />
          {lockedTalk.locked && (
            <div className="lock-banner">
              {/* 0-1t：止まった・失敗に見えないよう、やわらかい帯で */}
              <p role="status">歩きながら ─ 手を離しても聞いています</p>
              {lockedTalk.screenNote && <small>{lockedTalk.screenNote}</small>}
              <button type="button" onClick={() => stopRef.current?.()}>
                話し終えて送る
              </button>
            </div>
          )}
          {(companionAlt || (acknowledged && messages.length === 0 && !listening && !sending)) && (
            <div className="lcd-companion">
              {acknowledged && messages.length === 0 && !listening && !sending ? (
                // 0-1g(1)・0-2a：最初の問いかけはパートナーの上の吹き出し。触るたびに一言が替わり、弾む
                <PartnerGreeting
                  text={line.text}
                  kind={line.kind}
                  delayMs={300}
                  onTap={tapPartner}
                  onTyped={() => setGreetingTyped(true)}
                  reaction={partnerTap.reaction}
                  onAnimationEnd={partnerTap.onAnimationEnd}
                >
                  {companionAlt ? companionFigure : null}
                </PartnerGreeting>
              ) : (
                companionFigure
              )}
            </div>
          )}
          <div className="log" role="log" aria-label="パートナーとの会話" ref={logRef} data-noswipe-landscape>
            {messages.length > 0 && !listening && !sending && (
              // 0-1l：前の話は「話の履歴」に残して畳み、大きなパートナーに戻る
              <button
                type="button"
                className="new-talk"
                onClick={() => {
                  archiveTalk(viewer.name, messages);
                  setArchived(loadArchive(viewer.name));
                  askedFeedback.current = null;
                  setMessages([]);
                  setReadyAt(null);
                  setDeliveredAt(0);
                  levelRef.current = 0;
                  setLevel(0);
                  popStep.current = 0;
                  setSentTo(null);
                  setSuggestion(null);
                  stopCompose();
                  setComposing(null);
                  setSheetOpen(false);
                  setReturning(true);
                  window.setTimeout(() => setReturning(false), 700);
                }}
              >
                新しく話す
              </button>
            )}
            {messages.length > 0 && archived.length > 0 && (
              // 前の話は、今の会話の上にうすく残す。上へたどると読める
              <section className="chat-archive" aria-label="前の話">
                {archived.map((talk, talkIndex) => (
                  <ol key={talkIndex}>
                    {talk.map((message, index) => (
                      <li key={index} className={`chat-archive-row ${message.role === "user" ? "me" : "partner"}`}>
                        {message.content}
                      </li>
                    ))}
                  </ol>
                ))}
                <p className="chat-archive-divider">ここから新しい話</p>
              </section>
            )}
            {chatList}
            {cards}
            {canCompose && !safety && (
              <button type="button" className="remember find-knowledge" disabled={sending || finding} onClick={() => void findKnowledge()}>
                {finding ? "探しています…" : "校内の知恵を探す"}
              </button>
            )}
            {attachment && (
              <section className="attachment-chip" aria-label="付けたファイル">
                <AttachmentPreview attachment={attachment} />
                <p>ひとこと話して、「とどける」を押してください。</p>
                <button type="button" className="undo" onClick={() => void removeAttachment()}>
                  外す
                </button>
              </section>
            )}
          </div>
        </section>

        <form className="device-input" onSubmit={submit}>
          {listening ? (
            <HeardLine draft={draft} heard={heard} />
          ) : (
            <textarea
              aria-label="パートナーに書く"
              rows={2}
              maxLength={MAX_TEXT_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={enterToSend}
              placeholder="ここに打つか、下のボタンを押して話す"
            />
          )}
        </form>

        <div className="device-controls">
          <label className="device-side" data-busy={uploading}>
            <span className="device-side-face">
              <Icon name="attach" />
            </span>
            {uploading ? "付けています" : "写真"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading || listening}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
          </label>

          <ClickWheel
            invite={invite.breathing}
            onRotate={(degrees) => carouselRef.current?.turn(degrees)}
            onPoint={(dx, dy, wheelRadius, micRadius) => carouselRef.current?.setCancelHint(isCancelPoint(dx, dy, wheelRadius, micRadius))}
            onRelease={() => carouselRef.current?.release()}
            onAbort={() => carouselRef.current?.reset()}
          >
            <button
              type="button"
              className="device-mic"
              aria-pressed={listening}
              disabled={sending}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                pressY.current = event.clientY;
                pressX.current = event.clientX;
                setLift(0);
                pressMic();
              }}
              onPointerMove={(event) => moveMic(event.clientX, event.clientY)}
              onPointerUp={releaseMic}
              onPointerCancel={releaseMic}
              onClick={(event) => {
                if (justLocked.current) {
                  justLocked.current = false;
                  return;
                }
                if (lockedTalk.locked) {
                  stopRef.current?.();
                  return;
                }
                // 押し続けられないキーボードの操作は、固定と同じ動きにする
                if (event.detail !== 0) return;
                if (listening) stopRef.current?.();
                else {
                  listen();
                  if (isSpeechSupported()) lockedTalk.lock();
                }
              }}
            >
              <Icon name="talk" />
              {lockedTalk.locked ? "話し終えて送る" : listening ? "離すと送る" : "押し続けて話す"}
            </button>
            {listening && lift !== null && !lockedTalk.locked && (
              // 押している間だけ、どの向きへずらしても固定になることを目で見せる
              <span className="lock-hint" aria-hidden="true" style={{ "--lift": lift } as React.CSSProperties}>
                <span className="lock-hint-arrow">↔</span>
                ずらすと固定
              </span>
            )}
          </ClickWheel>

          <button
            type="button"
            className="device-side"
            data-mode={hasTyped ? "send" : "deliver"}
            data-ready={readyToDeliver}
            data-level={readyToDeliver ? level || 1 : undefined}
            disabled={listening || sending || (!hasTyped && !canCompose)}
            onClick={() => {
              if (hasTyped) void send(draft);
              else if (composing) setSheetOpen(true);
              else void startCompose(askTarget ?? undefined);
            }}
          >
            <span className="device-side-face">
              <Icon name="send" />
            </span>
            {hasTyped ? "パートナーへ送る" : "とどける"}
            {readyToDeliver && <small className="ready-note">{level >= 3 ? "もう投稿にできる" : "言葉になりそう"}</small>}
          </button>
        </div>

        <nav className="swipe-mark" aria-label="画面の切り替え">
          <Link href="/me">‹ 履歴と設定</Link>
          <span className="swipe-dots" aria-hidden="true">
            <i />
            <i data-current />
            <i />
          </span>
          <Link href="/minna">みんな ›</Link>
        </nav>
      </div>
    );
  }

  return (
    <div className="talk" data-viewer={viewer.name}>
      {burst && <SendBurst words={burst} avatarImage={avatarImage} onDone={() => setBurst(null)} />}
      {promiseCard}
      {avatarImage && (
        <div
          className="speaker"
          data-state={listening ? "listening" : sending ? "thinking" : "idle"}
          data-size={messages.length > 0 && !listening ? "small" : "large"}
        >
          <Avatar image={avatarImage} alt={`${viewer.name}さんのパートナー`} size={176} />
        </div>
      )}
      <div className="log" role="log" aria-label="パートナーとの会話">
        {messages.length === 0 && !listening && (
          <>
            {question && <p className="daily-question">{question}</p>}
          </>
        )}
        {bubbleList}
        {listening && (
          <p className="bubble user listening" role="status">
            <span className="listening-label">聞いています…</span>
            {heard}
          </p>
        )}
        {sending && (
          <p className="bubble assistant waiting" role="status">
            考えています…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {cards}

      {!device && canCompose && !listening && (
        <button type="button" className="compose-start" disabled={sending || preparing} onClick={() => void startCompose(askTarget ?? undefined)}>
          <Icon name="send" />
          {preparing ? "言葉にしています…" : "言葉にして送る"}
        </button>
      )}

      {canCompose && !listening && !safety && (
        <button type="button" className="compose-start" disabled={sending || finding} onClick={() => void findKnowledge()}>
          <Icon name="idea" />
          {finding ? "探しています…" : "校内の知恵を探す"}
        </button>
      )}

      {acknowledged && <p className="promise promise-short">{trial ? TRIAL_PROMISE_SHORT : PROMISE_SHORT}</p>}

      <div className="side-actions">
      {attachment ? (
        <section className="attachment-chip" aria-label="付けたファイル">
          <AttachmentPreview attachment={attachment} />
          <p>ひとこと話して、「言葉にして送る」を押してください。</p>
          <button type="button" className="undo" onClick={() => void removeAttachment()}>
            外す
          </button>
        </section>
      ) : (
        !listening && (
          <label className="attach-button">
            <Icon name="attach" />
            {uploading ? "付けています…" : "写真か PDF を付ける"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
          </label>
        )
      )}
      {!listening && (
        <Link className="walk-link" href="/walk">
          <Icon name="walk" />
          歩きながら話す
        </Link>
      )}
      </div>

      <div className="actions">
        {listening ? (
          <button type="button" className="primary stop" onClick={() => stopRef.current?.()}>
            <Icon name="stop" />
            話し終わった
          </button>
        ) : (
          <>
            <button type="button" className="primary" onClick={listen} disabled={sending}>
              <Icon name="talk" />
              話しかける
            </button>
            <button
              type="button"
              className="primary"
              aria-expanded={writing}
              onClick={() => setWriting((value) => !value)}
            >
              <Icon name="write" />
              文字で書く
            </button>
          </>
        )}
      </div>

      {writing && !listening && (
        <form className="write" onSubmit={submit}>
          <textarea
            aria-label="パートナーに書く"
            rows={2}
            maxLength={MAX_TEXT_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={sending || draft.trim() === ""}>
            パートナーに送る
          </button>
        </form>
      )}
    </div>
  );
}
