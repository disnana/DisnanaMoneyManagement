import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { router, usePathname, usePreventRemove } from 'expo-router';
import { accountAvailable, refreshAndroidAccount, useAndroidAccount } from '@/lib/androidAccount';
import {
  getReceiptConfig, getReceiptModes, isReceiptJobTerminal, quoteReceiptCredits, ReceiptAPIError, submitReceiptJob,
  type ReceiptConfig, type ReceiptDocument, type ReceiptJob, type ReceiptMode,
} from '@/lib/androidReceiptClient';
import {
  attachReceiptImages, buildReceiptInput, inspectReceiptFile, newReceiptID,
  receiptPreviewEnabled, removeReceiptFile, type ReceiptGroup, type ReceiptPage,
} from '@/lib/receiptDraftFiles';
import { metrics, usePalette } from '@/lib/theme';
import { canImportReceipt, initialReceiptItems, receiptImportDraft } from '@/lib/receiptImport';
import { ReceiptExpenseReview } from '@/ui/ReceiptExpenseReview';
import { openReceiptCamera, openReceiptGallery, ReceiptImageEditor, type ReceiptImageSource } from '@/ui/ReceiptImageEditor';
import {
  deleteLocalReceiptResult, listLocalReceiptResults, readLocalReceiptResult, readPendingReceipt,
  receivePendingReceiptResult, reservePendingReceipt, subscribeLocalReceiptResults, writePendingReceipt,
} from '@/lib/receiptLocalResults';

const DOCUMENT_TYPES: Record<string, string> = {
  itemized_receipt: 'レシート', payment_receipt: '領収書', invoice: '請求書',
  card_sales_slip: 'カード売上票', atm_statement: 'ATM明細', other: '対象外の書類', unknown: '種類不明',
};
const DOCUMENT_STATUS: Record<ReceiptDocument['status'], string> = {
  success: '読み取り完了', partial: '一部を読み取り', out_of_scope: '対象外', unreadable: '読み取り不可',
};
const JOB_STATUS: Record<string, string> = {
  QUEUED: '受付済み', PROCESSING: '解析中', SETTLING: 'CRを精算中', COMPLETED: '解析完了',
  CLAIMED: '準備中', SUBMITTING: '解析を開始中', SUBMISSION_UNKNOWN: '解析先の受付を確認中',
  PARTIAL: '一部の解析が完了', FAILED: '解析に失敗', CANCELLED: '取り消し済み', EXPIRED: '受付期限切れ',
};
const RECEIPT_MODES: Record<ReceiptMode, { name: string; description: string }> = {
  standard: { name: '通常', description: 'すぐ解析を始める' },
  background: { name: 'おまかせ', description: '時間に余裕があるとき' },
  batch: { name: '一括', description: '急がない書類をまとめる' },
};
const resultDate = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo' });
type ReceiptSourceTarget = { groupId?: string };
type ReceiptEditorQueue = ReceiptSourceTarget & { sources: ReceiptImageSource[] };
type ReceiptView = 'index' | 'confirm' | 'history' | 'results' | 'document';
type DocumentSelection = { jobId: string; groupId: string; index: number };
const ReceiptScreens = createContext<Record<ReceiptView, ReactNode> | { unavailable: ReactNode } | null>(null);

export function ReceiptFlowScreen({ screen }: { screen: ReceiptView }) {
  const views = useContext(ReceiptScreens);
  if (!views) return null;
  return 'unavailable' in views ? views.unavailable : views[screen];
}

function cr(amount: number) {
  return `${amount.toLocaleString('ja-JP')} CR`;
}

function resultWindow(seconds: number) {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}日間`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}時間`;
  if (seconds % 60 === 0) return `${seconds / 60}分間`;
  return `${seconds}秒間`;
}

function resultAmount(document: ReceiptDocument, value: number | null) {
  if (value === null || !document.currency) return '不明';
  if (document.currency === 'JPY') return `¥${value.toLocaleString('ja-JP')}`;
  return '日本円以外';
}

function requestError(error: unknown, polling = false) {
  if (error instanceof ReceiptAPIError) {
    if (error.code === 'receipt_intake_paused') return '新しい画像の受付を一時停止しています。時間をおいてお試しください。';
    if (error.status === 401 || error.status === 403) return 'アカウントの状態を確認して、再度お試しください。';
    if (error.status === 404) return polling ? '受付をまだ確認できません。時間をおいて受付状況をご確認ください。'
      : 'レシート解析を利用できません。接続先をご確認ください。';
    if (error.status === 402) return '送信に必要なCRが不足しています。';
    if (error.status === 409) return '現在の料金または受付状況を確認できませんでした。時間をおいて再度お試しください。';
    if (error.status === 400 || error.status === 413 || error.status === 422) return '画像を受け付けられませんでした。画像の形式・大きさを確認してください。';
  }
  return '通信または処理で問題が発生しました。時間をおいて再度お試しください。';
}

export function ReceiptFlowProvider({ children }: { children: ReactNode }) {
  const account = useAndroidAccount();
  useEffect(() => {
    if (receiptPreviewEnabled && accountAvailable && !account.accountId) void refreshAndroidAccount();
  }, [account.accountId]);

  if (!receiptPreviewEnabled || !accountAvailable || !account.signedIn || !account.accountId) {
    const unavailable = <Page><Surface>
      {!receiptPreviewEnabled || !accountAvailable ? <Copy>このアプリではレシート解析を利用できません。</Copy>
        : account.busy ? <ActivityIndicator accessibilityLabel="アカウントを確認中" /> : <>
          <Copy>レシート解析はログインしたアカウントでご利用いただけます。</Copy>
          <Action label="アカウント設定を開く" onPress={() => router.push('/settings/account')} />
        </>}
    </Surface></Page>;
    return <ReceiptScreens.Provider value={{ unavailable }}>{children}</ReceiptScreens.Provider>;
  }
  return <ReceiptWorkspace key={account.accountId} accountId={account.accountId} credits={account.credits}>
    {children}
  </ReceiptWorkspace>;
}

function ReceiptWorkspace({ accountId, credits, children }: { accountId: string; credits: number | null; children: ReactNode }) {
  const p = usePalette();
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  const [pending, setPending] = useState(() => readPendingReceipt(accountId));
  const [savedResults, setSavedResults] = useState(() => listLocalReceiptResults(accountId));
  const [selectedLocalId, setSelectedLocalId] = useState<string>();
  const [selection, setSelection] = useState<DocumentSelection>();
  const jobId = pending?.id;
  const [job, setJob] = useState<ReceiptJob>();
  const viewedId = selectedLocalId ?? jobId;
  const localResult = useMemo(() => viewedId && savedResults.some((entry) => entry.id === viewedId)
    ? readLocalReceiptResult(accountId, viewedId) : undefined, [accountId, viewedId, savedResults]);
  const viewedJob = localResult ?? (selectedLocalId ? undefined : job);
  const [notFound, setNotFound] = useState(false);
  const [config, setConfig] = useState<ReceiptConfig>();
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [configRefresh, setConfigRefresh] = useState(0);
  const [mode, setMode] = useState<ReceiptMode>('standard');
  const [pollRefresh, setPollRefresh] = useState(0);
  const [groups, setGroups] = useState<ReceiptGroup[]>([]);
  const [sourceTarget, setSourceTarget] = useState<ReceiptSourceTarget>();
  const [editorQueue, setEditorQueue] = useState<ReceiptEditorQueue>();
  const [preview, setPreview] = useState<ReceiptPage>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cachedFiles = useRef(new Set<string>());
  const open = useRef(true);
  const submitting = useRef(false);
  const allowExit = usePreventRemove(groups.length > 0 && !jobId, ({ repeat }) => {
    if (submitting.current) {
      Alert.alert('画像を送信しています', '受付を確認できるまでお待ちください。');
      return;
    }
    Alert.alert('送信していない画像を破棄しますか？', '選んだ画像と並び順がリセットされます。', [
      { text: '戻る', style: 'cancel' },
      { text: '破棄する', style: 'destructive', onPress: () => {
        allowExit();
        repeat();
      } },
    ]);
  });

  useEffect(() => {
    const updateArchive = () => setSavedResults(listLocalReceiptResults(accountId));
    const unsubscribe = subscribeLocalReceiptResults(accountId, updateArchive);
    updateArchive();
    return unsubscribe;
  }, [accountId]);

  useEffect(() => {
    open.current = true;
    const files = cachedFiles.current;
    return () => {
      open.current = false;
      if (!submitting.current) files.forEach(removeReceiptFile);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setConfigLoading(true);
    setConfigError('');
    void getReceiptConfig(controller.signal).then((value) => {
      if (!controller.signal.aborted) setConfig(value);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setConfigError(requestError(error));
    }).finally(() => {
      if (!controller.signal.aborted) setConfigLoading(false);
    });
    return () => controller.abort();
  }, [configRefresh]);

  useEffect(() => {
    if (!pending || pathname !== '/receipt-review/results' || selectedLocalId) return;
    const { id, startedAt } = pending;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setNotFound(false);
    async function poll(delay: number, maxDelay = 15_000) {
      try {
        const next = readLocalReceiptResult(accountId, id) ?? await receivePendingReceiptResult(accountId, controller.signal)
          ?? readLocalReceiptResult(accountId, id);
        if (controller.signal.aborted) return;
        if (!next || next.id !== id) {
          setPending(readPendingReceipt(accountId));
          return;
        }
        setJob(next);
        setMessage('');
        if (next.mode === 'batch') {
          delay = Math.max(delay, 60_000);
          maxDelay = 120_000;
        } else if (next.mode === 'background') {
          delay = Math.max(delay, 30_000);
          maxDelay = 60_000;
        }
        if (isReceiptJobTerminal(next.state)) {
          void refreshAndroidAccount();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ReceiptAPIError && error.status === 404) {
          const saved = readLocalReceiptResult(accountId, id);
          if (saved) {
            setJob(saved);
            setMessage('');
            return;
          }
          if (!readPendingReceipt(accountId)) {
            setPending(undefined);
            return;
          }
          // The server bounds a signed upload to 60 seconds. Leave a grace period before
          // offering to dismiss a missing ID, including interruption before the POST was sent.
          if (Date.now() - startedAt >= 120_000) {
            setNotFound(true);
            setMessage('受付が見つかりませんでした。状況を再確認するか、新しい受付を作成できます。');
            return;
          }
        }
        setMessage(requestError(error, true));
      }
      timer = setTimeout(() => void poll(Math.min(delay * 2, maxDelay), maxDelay), delay);
    }
    void poll(2500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pending, accountId, pollRefresh, pathname, selectedLocalId]);

  const pages = groups.flatMap((group) => group.pages);
  const modes = config ? getReceiptModes(config) : [];
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0];
  const selectedModeInfo = selectedMode ? RECEIPT_MODES[selectedMode.id] : undefined;
  const estimate = config && selectedMode && pages.length ? quoteReceiptCredits(config, pages.length, selectedMode.id) : undefined;
  const canPick = Boolean(config && !config.intake_paused && !configLoading && !configError && !busy && !editorQueue && !jobId);
  const imageSource = editorQueue?.sources[0];

  function removeTemporary(uri: string) {
    cachedFiles.current.delete(uri);
    removeReceiptFile(uri);
  }

  function followEditorQueue() {
    if (!editorQueue || !imageSource) return;
    removeTemporary(imageSource.uri);
    const sources = editorQueue.sources.slice(1);
    setEditorQueue(sources.length ? { ...editorQueue, sources } : undefined);
  }

  async function readSources(kind: ReceiptImageSource['kind'], limit: number): Promise<ReceiptImageSource[]> {
    if (kind === 'camera') return openReceiptCamera();
    if (kind === 'gallery') return openReceiptGallery(limit);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png'], multiple: limit > 1, copyToCacheDirectory: true,
    });
    if (picked.canceled) return [];
    try {
      if (picked.assets.length > limit) throw new Error(`一度に追加できる画像はあと ${limit} 枚です。`);
      const sources: ReceiptImageSource[] = [];
      for (const asset of picked.assets) {
        await inspectReceiptFile(asset.uri);
        const { width, height } = await Image.getSize(asset.uri);
        sources.push({ uri: asset.uri, name: asset.name, width, height, kind: 'file' });
      }
      return sources;
    } catch (error) {
      picked.assets.forEach((asset) => removeReceiptFile(asset.uri));
      throw error;
    }
  }

  async function selectPages(kind: ReceiptImageSource['kind'], groupId?: string) {
    if (!config || !canPick || busyRef.current) return;
    const limit = Math.min(config.max_total_images - pages.length, groupId
      ? config.max_images_per_group - (groups.find((group) => group.id === groupId)?.pages.length ?? 0)
      : config.max_groups - groups.length);
    if (limit < 1) return;
    setSourceTarget(undefined);
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      const sources = await readSources(kind, limit);
      if (!open.current || sources.length > limit) {
        sources.forEach((source) => removeReceiptFile(source.uri));
        if (open.current) throw new Error(`一度に追加できる画像はあと ${limit} 枚です。`);
        return;
      }
      if (sources.length === 0) return;
      sources.forEach((source) => cachedFiles.current.add(source.uri));
      setEditorQueue({ groupId, sources });
    } catch (error) {
      if (open.current) setMessage(error instanceof Error ? error.message : '画像を読み込めませんでした。');
    } finally {
      busyRef.current = false;
      if (open.current) setBusy(false);
    }
  }

  async function replacePage() {
    if (!editorQueue || !imageSource) return;
    const [replacement] = await readSources(imageSource.kind, 1);
    if (!replacement) return;
    if (!open.current) {
      removeReceiptFile(replacement.uri);
      return;
    }
    if (imageSource.uri !== replacement.uri) removeTemporary(imageSource.uri);
    cachedFiles.current.add(replacement.uri);
    setEditorQueue({ ...editorQueue, sources: [replacement, ...editorQueue.sources.slice(1)] });
    return replacement;
  }

  async function addEditedPage(uri: string) {
    if (!config || !editorQueue || !imageSource || busyRef.current) {
      removeReceiptFile(uri);
      return;
    }
    busyRef.current = true;
    try {
      const { type, bytes } = await inspectReceiptFile(uri);
      if (!open.current) {
        removeReceiptFile(uri);
        return;
      }
      const id = newReceiptID();
      const page = { id, uri, name: imageSource.name || 'レシート画像', type, bytes };
      const next = editorQueue.groupId
        ? groups.map((group) => group.id === editorQueue.groupId ? { ...group, pages: [...group.pages, page] } : group)
        : [...groups, { id: newReceiptID(), pages: [page] }];
      buildReceiptInput(next, config, selectedMode?.id);
      cachedFiles.current.add(uri);
      setGroups(next);
      setMessage('');
      followEditorQueue();
    } catch (error) {
      removeReceiptFile(uri);
      if (open.current) {
        Alert.alert('この画像を追加できませんでした', error instanceof Error ? error.message : '画像の容量を確認してください。');
      }
    } finally {
      busyRef.current = false;
    }
  }

  function removeFile(page: ReceiptPage) {
    removeTemporary(page.uri);
  }

  function removePage(groupId: string, page: ReceiptPage) {
    if (busyRef.current) return;
    setGroups((previous) => previous.map((group) => group.id === groupId
      ? { ...group, pages: group.pages.filter((candidate) => candidate.id !== page.id) } : group)
      .filter((group) => group.pages.length > 0));
    removeFile(page);
    setMessage('');
  }

  function movePage(groupId: string, from: number) {
    if (busyRef.current || from === 0) return;
    setGroups((previous) => previous.map((group) => {
      if (group.id !== groupId) return group;
      const ordered = [...group.pages];
      [ordered[from - 1], ordered[from]] = [ordered[from], ordered[from - 1]];
      return { ...group, pages: ordered };
    }));
  }

  async function send() {
    if (!config || config.intake_paused || busyRef.current || jobId) return;
    busyRef.current = true;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    const id = newReceiptID();
    try {
      const input = await attachReceiptImages(buildReceiptInput(groups, config, selectedMode?.id), groups);
      if (!open.current) return;
      // Store the ID before the POST so a process restart can resume by GET even if the reply is lost.
      const pointer = { id, startedAt: Date.now() };
      if (!reservePendingReceipt(accountId, pointer)) {
        const current = readPendingReceipt(accountId);
        if (current) setPending(current);
        setMessage(current ? 'すでに受付があります。受付状況を確認してください。' : 'アカウントを確認してから、もう一度お試しください。');
        return;
      }
      try {
        const accepted = await submitReceiptJob(id, input, undefined, accountId);
        if (open.current) {
          setJob(accepted);
          setPending(pointer);
        }
        pages.forEach(removeFile);
        if (open.current) finishSubmission();
      } catch (error) {
        if (error instanceof ReceiptAPIError && !error.mayHaveCommitted) {
          if (readPendingReceipt(accountId)?.id === pointer.id) writePendingReceipt(accountId, undefined);
          if ((error.status === 409 || error.code === 'receipt_intake_paused') && open.current) {
            setConfigRefresh((previous) => previous + 1);
          }
          throw error;
        }
        if (open.current) {
          setPending(pointer);
          setMessage('受付の結果を確認しています。同じ画像を送信し直す必要はありません。');
        }
        pages.forEach(removeFile);
        if (open.current) finishSubmission();
      }
    } catch (error) {
      if (open.current) setMessage(error instanceof ReceiptAPIError ? requestError(error)
        : error instanceof Error ? error.message : '送信の準備ができませんでした。');
    } finally {
      submitting.current = false;
      if (!open.current) cachedFiles.current.forEach(removeReceiptFile);
      busyRef.current = false;
      if (open.current) setBusy(false);
    }
  }

  function finishSubmission() {
    setGroups([]);
    setSelectedLocalId(undefined);
    setSelection(undefined);
    if (currentPath.current === '/receipt-review/confirm') router.replace('/receipt-review/results');
  }

  function newDraft() {
    if (!notFound && (!viewedJob || !isReceiptJobTerminal(viewedJob.state))) return;
    if (readPendingReceipt(accountId)?.id === jobId) writePendingReceipt(accountId, undefined);
    setPending(undefined);
    setJob(undefined);
    setSelectedLocalId(undefined);
    setSelection(undefined);
    setNotFound(false);
    setMessage('');
    setConfigRefresh((previous) => previous + 1);
    router.dismissTo('/receipt-review');
  }

  function removeLocalResult(id: string) {
    Alert.alert('端末の解析結果を削除しますか？', '登録済みの支出は削除されません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => {
        try {
          deleteLocalReceiptResult(accountId, id);
          setSelectedLocalId(undefined);
          if (id === jobId) {
            setPending(undefined);
            setJob(undefined);
          }
          router.back();
        } catch {
          Alert.alert('端末の解析結果を削除できませんでした');
        }
      } },
    ]);
  }

  const selectedDocument = viewedJob && selection?.jobId === viewedJob.id
    ? viewedJob.groups.find((group) => group.id === selection.groupId)?.result?.documents[selection.index] : undefined;

  function showResult(localID?: string) {
    setSelectedLocalId(localID);
    setSelection(undefined);
    router.navigate('/receipt-review/results');
  }

  const configNotice = configLoading ? <ActivityIndicator color={p.tint} accessibilityLabel="受付設定を確認中" />
    : configError || config?.intake_paused ? <Surface>
      <Notice text={configError || '新しい画像の受付を一時停止しています。'} />
      <Action label="受付設定を再確認" onPress={() => setConfigRefresh((previous) => previous + 1)} />
    </Surface> : null;

  const draft = <Page footer={groups.length > 0 && !jobId ? <Action primary label="送信内容を確認"
    onPress={() => router.navigate('/receipt-review/confirm')} disabled={!canPick} /> : undefined}>
    {jobId ? <Surface>
      <Heading>{job ? JOB_STATUS[job.state] ?? '受付済み' : '受付状況を確認'}</Heading>
      <Copy>この受付の状況や、読み取りが終わった書類を確認できます。</Copy>
      <Action primary label="受付状況を見る" onPress={() => showResult()} />
    </Surface> : <>
      {configNotice}
      {groups.length === 0 ? <Surface>
        <Heading>画像を追加</Heading>
        <Copy>長いレシートは、続きが少し重なるように分けて撮影できます。</Copy>
      </Surface> : <Surface>
        <Heading>送る書類</Heading>
        <Copy>書類 {groups.length}件 · 画像 {pages.length}枚</Copy>
      </Surface>}
      {groups.map((group, index) => (
          <Surface key={group.id}>
            <Heading>書類 {index + 1} · {group.pages.length}枚</Heading>
            {group.pages.map((page, pageIndex) => (
              <View key={page.id} style={[styles.pageRow, { borderColor: p.separator }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`書類 ${index + 1}のページ ${pageIndex + 1}を拡大`}
                  onPress={() => setPreview(page)} style={styles.pagePreview}>
                  <Image source={{ uri: page.uri }} style={[styles.thumbnail, { backgroundColor: p.fill }]} resizeMode="contain" />
                  <View style={styles.pageText}>
                    <Text style={[styles.copy, { color: p.text }]}>ページ {pageIndex + 1}</Text>
                    <Text style={[styles.small, { color: p.textSecondary }]} numberOfLines={1}>{page.name}</Text>
                  </View>
                </Pressable>
                {pageIndex > 0 ? <Action label="上へ" accessibilityLabel={`書類 ${index + 1}のページ ${pageIndex + 1}を上へ移動`}
                  onPress={() => movePage(group.id, pageIndex)} disabled={busy} /> : null}
                <Action label="外す" accessibilityLabel={`書類 ${index + 1}のページ ${pageIndex + 1}を外す`}
                  onPress={() => removePage(group.id, page)} disabled={busy} />
              </View>
            ))}
            <Action label="同じ書類のページを追加" onPress={() => setSourceTarget({ groupId: group.id })}
              disabled={!canPick || group.pages.length >= (config?.max_images_per_group ?? 0) ||
                pages.length >= (config?.max_total_images ?? 0)} />
          </Surface>
        ))}
        {groups.length ? <>
          <Action label="別の書類を追加"
            onPress={() => setSourceTarget({})} disabled={!canPick || groups.length >= (config?.max_groups ?? 0) ||
              pages.length >= (config?.max_total_images ?? 0)} />
          <Copy>別の書類はそれぞれの書類としてまとめて送信します。</Copy>
        </> : <Surface>
          <Action primary label="カメラで撮影" onPress={() => void selectPages('camera')} disabled={!canPick} />
          <Action label="写真から選ぶ" onPress={() => void selectPages('gallery')} disabled={!canPick} />
          <Action label="ファイルから選ぶ" onPress={() => void selectPages('file')} disabled={!canPick} />
        </Surface>}
    </>}
    {message && !jobId ? <Notice text={message} /> : null}
    <Surface>
      <Action label={savedResults.length ? `端末に保存した結果（${savedResults.length}件）` : '端末に保存した結果'}
        onPress={() => router.navigate('/receipt-review/history')} />
    </Surface>
  </Page>;

  const canSend = canPick && estimate !== undefined && (credits === null || estimate <= credits);
  const confirmation = <Page footer={selectedMode && estimate !== undefined && !jobId ? <>
    <Text style={[styles.small, { color: p.textSecondary }]}>
      対象外や、ぼけ・反射で読めないと正常に判定された画像もCRを消費します。
    </Text>
    <Action primary label={busy ? '送信中…' : `最大 ${cr(estimate)} で送信`}
      disabled={!canSend} onPress={() => void send()} />
  </> : undefined}>
    {jobId ? <Surface>
      <Heading>受付を確認できます</Heading>
      <Action primary label="受付状況を見る" onPress={() => showResult()} />
    </Surface> : pages.length === 0 ? <Surface>
      <Copy>送信する画像を追加してください。</Copy>
      <Action primary label="画像を追加する" onPress={() => router.dismissTo('/receipt-review')} />
    </Surface> : <>
      {configNotice}
      <Surface>
        <Heading>書類 {groups.length}件 · 画像 {pages.length}枚</Heading>
        <Copy>{groups.map((group, index) => `書類 ${index + 1}（${group.pages.length}枚）`).join('、')}</Copy>
        <Action label="画像とページ順を見直す" disabled={busy} onPress={() => router.dismissTo('/receipt-review')} />
      </Surface>
      {modes.length > 1 && pages.length > 0 ? <Surface>
          <Heading>解析モード</Heading>
          {modes.map((item) => {
            const info = RECEIPT_MODES[item.id];
            const selected = item.id === selectedMode?.id;
            return (
              <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                disabled={busy} onPress={() => setMode(item.id)} style={[styles.modeOption, {
                  backgroundColor: selected ? p.fill : p.card, borderColor: selected ? p.tint : p.outline,
                }]}>
                <View style={styles.modeTitle}>
                  <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{info.name}</Text>
                  <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>
                    {config ? cr(quoteReceiptCredits(config, pages.length, item.id)) : ''}
                  </Text>
                </View>
                <Copy>{info.description}{item.max_wait_seconds && item.id !== 'standard'
                  ? ` · ${item.max_wait_seconds % 3600 === 0 ? `${item.max_wait_seconds / 3600}時間` : resultWindow(item.max_wait_seconds)}枠` : ''}</Copy>
              </Pressable>
            );
          })}
        </Surface> : null}
      {config && selectedMode && estimate !== undefined ? <Surface>
        <View style={styles.modeTitle}>
          <Heading>送信時の最大CR</Heading>
          <Text style={[styles.estimate, { color: p.text }]}>{cr(estimate)}</Text>
        </View>
        <Copy>{selectedModeInfo?.name}{credits == null ? '' : ` · 利用可能 ${cr(credits)}`}</Copy>
        {selectedMode.millicredits_per_image % 1000 !== 0 ? <Copy>画像全体の料金を合計し、1 CR単位に切り上げます。</Copy> : null}
        <Copy>カード番号の全桁など、読み取りに不要な情報が写っていないか確認してください。</Copy>
        {config.result_retention_seconds ? <Copy>
          受信期間は精算後{resultWindow(config.result_retention_seconds)}です。期間内に通信できる状態でアプリを開くと、結果を端末に保存します。
        </Copy> : null}
        {credits !== null && estimate > credits ? <>
          <Notice text="送信に必要なCRが不足しています。" />
          <Action label="残高を更新" onPress={() => void refreshAndroidAccount()} disabled={busy} />
        </> : null}
        <View style={styles.policyLinks}>
          {[
            { label: '利用規約', url: 'https://dmm.disnana.com/terms/#ai-receipt' },
            { label: 'プライバシーポリシー', url: 'https://dmm.disnana.com/privacy/#ai-receipt' },
          ].map(({ label, url }) => (
            <Pressable key={url} accessibilityRole="link" hitSlop={8} onPress={() => {
              void Linking.openURL(url).catch(() => Alert.alert('ページを開けませんでした'));
            }}>
              <Text style={{ color: p.tint, fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Surface> : null}
      {message ? <Notice text={message} /> : null}
    </>}
  </Page>;

  const history = <Page>
    <Surface>
      <Copy>保存した結果は、サーバーの受信期間を過ぎてもオフラインで確認できます。</Copy>
      {savedResults.length ? savedResults.map((entry) => <ReceiptRow key={entry.id}
        title={entry.merchant ? `${entry.merchant}${entry.documentCount > 1 ? ' ほか' : ''}` : '読み取り結果'}
        detail={`${resultDate.format(entry.savedAt)} · 書類 ${entry.documentCount}件 · ${JOB_STATUS[entry.state]}`}
        onPress={() => showResult(entry.id)} />) : <Heading>保存した結果はありません</Heading>}
    </Surface>
  </Page>;

  const results = <Page>
    {!viewedId ? <Surface><Copy>表示する受付はありません。</Copy>
      <Action label="画像の追加へ戻る" onPress={() => router.dismissTo('/receipt-review')} />
    </Surface> : <>
      <Surface>
        <Heading>{viewedJob ? JOB_STATUS[viewedJob.state] ?? '処理中'
          : selectedLocalId ? '端末の結果を読み込めません' : notFound ? '受付を確認できません' : '受付を確認中'}</Heading>
        <Copy>{viewedJob ? `最大 ${cr(viewedJob.maximum_credit)}　確定 ${viewedJob.final_credit == null ? '精算待ち' : cr(viewedJob.final_credit)}`
          : selectedLocalId ? '一覧から別の結果を開くことができます。' : '画面を閉じても処理は続きます。'}</Copy>
        {viewedJob?.mode ? <Copy>解析モード {RECEIPT_MODES[viewedJob.mode].name}</Copy> : null}
        {viewedJob?.deadline && !isReceiptJobTerminal(viewedJob.state)
          ? <Copy>処理期限 {resultDate.format(new Date(viewedJob.deadline))}（日本時間）</Copy> : null}
        {localResult ? <Copy>端末に保存済み</Copy> : viewedJob?.result_expired ? <Notice text="解析結果の受信期限を過ぎました。" />
          : viewedJob?.result_expires_at ? <Copy>受信期限 {resultDate.format(new Date(viewedJob.result_expires_at))}（日本時間）</Copy> : null}
        {!selectedLocalId && message ? <Notice text={message} /> : null}
        {!selectedLocalId && (!viewedJob || !isReceiptJobTerminal(viewedJob.state))
          ? <Action label="状況を更新" onPress={() => setPollRefresh((previous) => previous + 1)} /> : null}
      </Surface>
      {viewedJob?.groups.map((group, index) => (
        <Surface key={`${viewedId}-${group.id}`}>
          <Heading>書類 {index + 1}</Heading>
          {group.result && !viewedJob.result_expired ? group.result.documents.map((document, documentIndex) => (
            <ReceiptRow key={documentIndex}
              title={document.merchant || DOCUMENT_TYPES[document.document_type] || '読み取り結果'}
              detail={[DOCUMENT_STATUS[document.status], document.date,
                document.total_minor !== null ? resultAmount(document, document.total_minor) : null].filter(Boolean).join(' · ')}
              onPress={() => {
                setSelection({ jobId: viewedJob.id, groupId: group.id, index: documentIndex });
                router.navigate('/receipt-review/document');
              }} />
          )) : <Copy>{viewedJob.result_expired ? '受信期限切れ' : JOB_STATUS[group.state] ?? '解析結果を待っています。'}</Copy>}
        </Surface>
      ))}
      {selectedLocalId ? <Action label="この結果を端末から削除" onPress={() => removeLocalResult(selectedLocalId)} /> : null}
      {!selectedLocalId && (notFound || (viewedJob && isReceiptJobTerminal(viewedJob.state)))
        ? <Action primary label="新しい読み取り" onPress={newDraft} /> : null}
    </>}
  </Page>;

  const documentDetails = <Page>
    {selectedDocument && viewedJob ? <>
      <Copy>支出を登録する前に、元の書類と見比べてください。</Copy>
      <DocumentResult key={`${selection?.jobId}-${selection?.groupId}-${selection?.index}`}
        document={selectedDocument} allowImport={viewedJob.settled} />
    </> : <Surface><Copy>確認する書類を解析結果から選んでください。</Copy>
      <Action label="解析結果を見る" onPress={() => router.dismissTo('/receipt-review/results')} />
    </Surface>}
  </Page>;

  return (
    <ReceiptScreens.Provider value={{ index: draft, confirm: confirmation, history, results, document: documentDetails }}>
      {children}
      <Modal visible={Boolean(sourceTarget)} transparent animationType="fade" onRequestClose={() => setSourceTarget(undefined)}>
        <View style={styles.sourceBackdrop}>
          <View style={[styles.sourcePanel, { backgroundColor: p.card }]}>
            <Heading>{sourceTarget?.groupId ? '同じ書類のページを追加' : '別の書類を追加'}</Heading>
            <Action primary label="カメラで撮影" onPress={() => void selectPages('camera', sourceTarget?.groupId)} />
            <Action label="写真から選ぶ" onPress={() => void selectPages('gallery', sourceTarget?.groupId)} />
            <Action label="ファイルから選ぶ" onPress={() => void selectPages('file', sourceTarget?.groupId)} />
            <Action label="キャンセル" onPress={() => setSourceTarget(undefined)} />
          </View>
        </View>
      </Modal>
      {config && imageSource ? <ReceiptImageEditor
        source={imageSource} maxPixels={config.max_image_pixels}
        maxBytes={Math.max(1, Math.min(config.max_image_bytes,
          config.max_total_image_bytes - pages.reduce((bytes, page) => bytes + page.bytes, 0)))}
        onConfirm={addEditedPage} onReplace={replacePage}
        onClose={() => { if (!busyRef.current) followEditorQueue(); }} /> : null}
      <Modal visible={Boolean(preview)} onRequestClose={() => setPreview(undefined)} animationType="fade">
        <View style={[styles.modal, { backgroundColor: p.bg }]}>
          {preview ? <Image source={{ uri: preview.uri }} style={styles.fullPreview} resizeMode="contain"
            accessibilityLabel={preview.name} /> : null}
          <Action primary label="閉じる" onPress={() => setPreview(undefined)} />
        </View>
      </Modal>
    </ReceiptScreens.Provider>
  );
}

function DocumentResult({ document, allowImport }: { document: ReceiptDocument; allowImport: boolean }) {
  const p = usePalette();
  const editable = allowImport && canImportReceipt(document) && (document.items.length > 0 ||
    receiptImportDraft(document, 'merchant', initialReceiptItems(document)) !== undefined);
  const pageNumbers = document.source_image_ids.map((id) => /^g\d+-p(\d+)$/.exec(id)?.[1])
    .filter((page) => page !== undefined).join('・');
  return (
    <View style={[styles.document, { backgroundColor: p.fill }]}>
      <Text style={[styles.small, { color: p.textSecondary }]}>
        {DOCUMENT_TYPES[document.document_type] ?? '書類'} · {DOCUMENT_STATUS[document.status]}
      </Text>
      {pageNumbers ? <Copy>対象ページ {pageNumbers}</Copy> : null}
      {document.quality_reason ? <Copy>{document.quality_reason === 'blur' ? 'ぼけのため読み取れませんでした。'
        : '反射のため読み取れませんでした。'}</Copy> : null}
      {document.merchant ? <Heading>{document.merchant}</Heading> : null}
      {document.date ? <Copy>{document.date}</Copy> : null}
      {document.total_minor !== null ? <Copy>合計 {resultAmount(document, document.total_minor)}</Copy> : null}
      {!editable ? document.items.map((item, index) => (
        <Copy key={index}>{item.name ?? '品目不明'} · {resultAmount(document, item.amount_minor)}</Copy>
      )) : null}
      {document.payments.map((payment, index) => (
        <Copy key={index}>{payment.payment_label ?? payment.brand ?? payment.method ?? '支払い方法不明'}
          {payment.last_four ? `（下4桁 ${payment.last_four}）` : ''} · {resultAmount(document, payment.amount_minor)}</Copy>
      ))}
      {editable ? <ReceiptExpenseReview document={document} /> : null}
    </View>
  );
}

function Page({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: p.bg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView>
    {footer ? <View style={[styles.footer, { backgroundColor: p.card, paddingBottom: Math.max(10, insets.bottom) }]}>
      {footer}
    </View> : null}
  </View>;
}

function ReceiptRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, {
    backgroundColor: pressed ? p.fill : p.bg,
  }]}>
    <View style={styles.pageText}>
      <Text style={{ color: p.text, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>{title}</Text>
      <Text style={{ color: p.textSecondary, fontSize: 13 }}>{detail}</Text>
    </View>
    <Text accessible={false} style={{ color: p.textSecondary, fontSize: 22 }}>›</Text>
  </Pressable>;
}

function Surface({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <View style={[styles.surface, { backgroundColor: p.card, borderRadius: metrics.cardRadius }]}>{children}</View>;
}

function Heading({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text accessibilityRole="header" style={[styles.heading, { color: p.text }]}>{children}</Text>;
}

function Copy({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.copy, { color: p.textSecondary }]}>{children}</Text>;
}

function Notice({ text }: { text: string }) {
  const p = usePalette();
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.copy, { color: p.danger }]}>{text}</Text>;
}

function Action({ label, onPress, accessibilityLabel, primary, disabled }: {
  label: string; onPress: () => void; accessibilityLabel?: string; primary?: boolean; disabled?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [styles.action, {
      backgroundColor: primary ? p.tint : p.fill, opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
    }]}>
    <Text style={[styles.actionLabel, { color: primary ? p.onTint : p.tint }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 9, gap: 6 },
  listRow: { minHeight: 52, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 10, alignItems: 'center' },
  surface: { padding: 16, gap: 10 },
  heading: { fontSize: 17, fontWeight: '700' },
  estimate: { fontSize: 27, fontWeight: '700', fontVariant: ['tabular-nums'] },
  modeOption: { borderRadius: 15, borderWidth: 1, padding: 11, gap: 4 },
  modeTitle: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  sourceBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: '#102c2588' },
  sourcePanel: { borderRadius: 24, padding: 18, paddingBottom: 22, gap: 10 },
  policyLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 12, paddingVertical: 6 },
  copy: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 16 },
  action: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center',
    alignItems: 'center', borderRadius: metrics.controlRadius },
  actionLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  pagePreview: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageText: { flex: 1, minWidth: 0 },
  thumbnail: { width: 48, height: 60, borderRadius: 8 },
  document: { gap: 6, padding: 12, borderRadius: 14 },
  modal: { flex: 1, padding: 20, paddingTop: 48, paddingBottom: 36, gap: 16 },
  fullPreview: { flex: 1, width: '100%' },
});
