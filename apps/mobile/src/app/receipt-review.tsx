import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { accountAvailable, refreshAndroidAccount, useAndroidAccount } from '@/lib/androidAccount';
import {
  getReceiptConfig, getReceiptJob, isReceiptJobTerminal, ReceiptAPIError, submitReceiptJob,
  type ReceiptConfig, type ReceiptDocument, type ReceiptJob,
} from '@/lib/androidReceiptClient';
import { kv } from '@/lib/kv';
import {
  attachReceiptImages, buildReceiptInput, inspectReceiptFile, newReceiptID, parsePendingReceipt, receiptExpenseAmount,
  receiptPreviewEnabled, removeReceiptFile, type ReceiptGroup, type ReceiptPage,
} from '@/lib/receiptDraftFiles';
import { metrics, usePalette } from '@/lib/theme';

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

function cr(amount: number) {
  return `${amount.toLocaleString('ja-JP')} CR`;
}

function resultAmount(document: ReceiptDocument, value: number | null) {
  if (value === null || !document.currency) return '不明';
  if (document.currency === 'JPY') return `¥${value.toLocaleString('ja-JP')}`;
  return '日本円以外';
}

function requestError(error: unknown, polling = false) {
  if (error instanceof ReceiptAPIError) {
    if (error.status === 401 || error.status === 403) return 'アカウントの状態を確認して、再度お試しください。';
    if (error.status === 404) return polling ? '受付をまだ確認できません。時間をおいて受付状況をご確認ください。'
      : 'レシート解析を利用できません。接続先をご確認ください。';
    if (error.status === 402) return '送信に必要なCRが不足しています。';
    if (error.status === 409) return '現在の料金または受付状況を確認できませんでした。時間をおいて再度お試しください。';
    if (error.status === 400 || error.status === 413 || error.status === 422) return '画像を受け付けられませんでした。画像の形式・大きさを確認してください。';
  }
  return '通信または処理で問題が発生しました。時間をおいて再度お試しください。';
}

export default function ReceiptReviewScreen() {
  const account = useAndroidAccount();
  useEffect(() => {
    if (receiptPreviewEnabled && accountAvailable && !account.accountId) void refreshAndroidAccount();
  }, [account.accountId]);

  if (!receiptPreviewEnabled || !accountAvailable) {
    return <Page><Surface><Copy>このアプリではレシート解析を利用できません。</Copy></Surface></Page>;
  }
  if (!account.signedIn || !account.accountId) {
    return <Page><Surface>
      {account.busy ? <ActivityIndicator accessibilityLabel="アカウントを確認中" /> : <>
        <Copy>レシート解析はログインしたアカウントでご利用いただけます。</Copy>
        <Action label="アカウント設定を開く" onPress={() => router.push('/settings/account')} />
      </>}
    </Surface></Page>;
  }
  return <ReceiptWorkspace key={account.accountId} accountId={account.accountId} credits={account.credits} />;
}

function ReceiptWorkspace({ accountId, credits }: { accountId: string; credits: number | null }) {
  const p = usePalette();
  const jobKey = `dmm.receipt.job.v1.${accountId}`;
  const [pending, setPending] = useState(() => parsePendingReceipt(kv.getItem(jobKey)));
  const jobId = pending?.id;
  const [job, setJob] = useState<ReceiptJob>();
  const [notFound, setNotFound] = useState(false);
  const [config, setConfig] = useState<ReceiptConfig>();
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [configRefresh, setConfigRefresh] = useState(0);
  const [pollRefresh, setPollRefresh] = useState(0);
  const [groups, setGroups] = useState<ReceiptGroup[]>([]);
  const [preview, setPreview] = useState<ReceiptPage>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cachedFiles = useRef(new Set<string>());
  const open = useRef(true);
  const submitting = useRef(false);

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
    if (!pending) return;
    const { id, startedAt } = pending;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setNotFound(false);
    async function poll(delay: number) {
      try {
        const next = await getReceiptJob(id, controller.signal);
        if (controller.signal.aborted) return;
        setJob(next);
        setMessage('');
        if (isReceiptJobTerminal(next.state)) {
          void refreshAndroidAccount();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ReceiptAPIError && error.status === 404) {
          if (!parsePendingReceipt(kv.getItem(jobKey))) {
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
      timer = setTimeout(() => void poll(Math.min(delay * 2, 15_000)), delay);
    }
    void poll(2500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pending, jobKey, pollRefresh]);

  const pages = groups.flatMap((group) => group.pages);
  const estimate = config && pages.length ? pages.length * config.credits_per_image : undefined;
  const canPick = Boolean(config && !configLoading && !configError && !busy);

  function removeFile(page: ReceiptPage) {
    cachedFiles.current.delete(page.uri);
    removeReceiptFile(page.uri);
  }

  async function selectPages(groupId?: string) {
    if (!config || !canPick || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    let selected: DocumentPicker.DocumentPickerAsset[] = [];
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'], multiple: true, copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      selected = result.assets;
      if (!open.current) return;
      const permitted = Math.min(config.max_total_images - pages.length, groupId
        ? config.max_images_per_group - (groups.find((group) => group.id === groupId)?.pages.length ?? 0)
        : config.max_groups - groups.length);
      if (selected.length > permitted) throw new Error(`一度に追加できる画像はあと ${permitted} 枚です。`);
      const added: ReceiptPage[] = [];
      for (const asset of selected) {
        const { type, bytes } = await inspectReceiptFile(asset.uri);
        if (bytes > config.max_image_bytes) throw new Error('1枚あたりのファイルサイズの上限を超えています。');
        const { width, height } = await Image.getSize(asset.uri).catch(() => { throw new Error('画像の大きさを確認できませんでした。'); });
        if (width <= 0 || height <= 0 || width * height > config.max_image_pixels) throw new Error('画像の縦横サイズが上限を超えています。');
        if (!open.current) return;
        added.push({ id: newReceiptID(), uri: asset.uri, name: asset.name, type, bytes });
      }
      const next = groupId
        ? groups.map((group) => group.id === groupId ? { ...group, pages: [...group.pages, ...added] } : group)
        : [...groups, ...added.map((page) => ({ id: newReceiptID(), pages: [page] }))];
      buildReceiptInput(next, config);
      added.forEach((page) => cachedFiles.current.add(page.uri));
      selected = [];
      setGroups(next);
    } catch (error) {
      if (open.current) setMessage(error instanceof Error ? error.message : '画像を読み込めませんでした。');
    } finally {
      selected.forEach((asset) => removeReceiptFile(asset.uri));
      busyRef.current = false;
      if (open.current) setBusy(false);
    }
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
    if (!config || busyRef.current || jobId) return;
    busyRef.current = true;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    const id = newReceiptID();
    try {
      const input = await attachReceiptImages(buildReceiptInput(groups, config), groups);
      if (!open.current) return;
      // Store the ID before the POST so a process restart can resume by GET even if the reply is lost.
      const pointer = { id, startedAt: Date.now() };
      kv.setItem(jobKey, JSON.stringify(pointer));
      try {
        const accepted = await submitReceiptJob(id, input);
        if (open.current) {
          setJob(accepted);
          setPending(pointer);
        }
        pages.forEach(removeFile);
        if (open.current) setGroups([]);
      } catch (error) {
        if (error instanceof ReceiptAPIError && !error.mayHaveCommitted) {
          kv.setItem(jobKey, '');
          if (error.status === 409 && open.current) setConfigRefresh((previous) => previous + 1);
          throw error;
        }
        if (open.current) {
          setPending(pointer);
          setMessage('受付の結果を確認しています。同じ画像を送信し直す必要はありません。');
        }
        pages.forEach(removeFile);
        if (open.current) setGroups([]);
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

  function newDraft() {
    if (!notFound && (!job || !isReceiptJobTerminal(job.state))) return;
    kv.setItem(jobKey, '');
    setPending(undefined);
    setJob(undefined);
    setNotFound(false);
    setMessage('');
    setConfigRefresh((previous) => previous + 1);
  }

  return (
    <Page>
      <Surface>
        <Heading>{jobId ? '解析結果' : '画像を確認して送信'}</Heading>
        <Copy>{jobId ? '解析状況と確定したCRを確認できます。支出に入力する前に、元の書類と内容を見比べてください。' :
          'レシート・領収書・請求書などを選んでください。反射や影を避け、文字と四隅が写った画像を使うと読み取りやすくなります。長い書類は、前後が少し重なるように分けて選んでください。'}</Copy>
      </Surface>
      {jobId ? <>
        <Surface>
          <Heading>{job ? JOB_STATUS[job.state] ?? '処理中' : notFound ? '受付を確認できません' : '受付を確認中'}</Heading>
          <Copy>{job ? `最大 ${cr(job.maximum_credit)}　確定 ${job.final_credit == null ? '精算待ち' : cr(job.final_credit)}`
            : '画面を閉じても、ここから受付状況を確認できます。'}</Copy>
          {message ? <Notice text={message} /> : null}
          {!job || !isReceiptJobTerminal(job.state)
            ? <Action label="状況を更新" onPress={() => setPollRefresh((previous) => previous + 1)} /> : null}
        </Surface>
        {job?.groups.map((group, index) => (
          <Surface key={group.id}>
            <Heading>書類 {index + 1}</Heading>
            {group.result ? group.result.documents.map((document, documentIndex) => (
              <DocumentResult key={documentIndex} document={document} />
            )) : <Copy>{JOB_STATUS[group.state] ?? '解析結果を待っています。'}</Copy>}
          </Surface>
        ))}
        {notFound || (job && isReceiptJobTerminal(job.state))
          ? <Action label="新しい受付を作成" onPress={newDraft} /> : null}
      </> : <>
        {configLoading ? <ActivityIndicator color={p.tint} accessibilityLabel="料金を確認中" /> : null}
        {configError ? <Surface>
          <Notice text={configError} />
          <Action label="料金を再確認" onPress={() => setConfigRefresh((previous) => previous + 1)} />
        </Surface> : null}
        {groups.map((group, index) => (
          <Surface key={group.id}>
            <Heading>書類 {index + 1} · {group.pages.length}枚</Heading>
            {group.pages.map((page, pageIndex) => (
              <View key={page.id} style={[styles.pageRow, { borderColor: p.separator }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`ページ ${pageIndex + 1}を拡大`}
                  onPress={() => setPreview(page)} style={styles.pagePreview}>
                  <Image source={{ uri: page.uri }} style={[styles.thumbnail, { backgroundColor: p.fill }]} resizeMode="contain" />
                  <View style={styles.pageText}>
                    <Text style={[styles.copy, { color: p.text }]}>ページ {pageIndex + 1}</Text>
                    <Text style={[styles.small, { color: p.textSecondary }]} numberOfLines={1}>{page.name}</Text>
                  </View>
                </Pressable>
                {pageIndex > 0 ? <Action label="上へ" accessibilityLabel={`ページ ${pageIndex + 1}を上へ移動`}
                  onPress={() => movePage(group.id, pageIndex)} disabled={busy} /> : null}
                <Action label="外す" accessibilityLabel={`ページ ${pageIndex + 1}を外す`}
                  onPress={() => removePage(group.id, page)} disabled={busy} />
              </View>
            ))}
            <Action label="同じ書類のページを追加" onPress={() => void selectPages(group.id)}
              disabled={!canPick || group.pages.length >= (config?.max_images_per_group ?? 0) ||
                pages.length >= (config?.max_total_images ?? 0)} />
          </Surface>
        ))}
        <Action label={groups.length ? '別の書類の画像を追加' : 'JPEG・PNGの画像を選ぶ'}
          onPress={() => void selectPages()} disabled={!canPick || groups.length >= (config?.max_groups ?? 0) ||
            pages.length >= (config?.max_total_images ?? 0)} />
        {config ? <Surface>
          <Heading>送信時の最大CR</Heading>
          <Text style={[styles.estimate, { color: p.text }]}>{estimate == null ? '—' : cr(estimate)}</Text>
          <Copy>画像1枚につき {cr(config.credits_per_image)}。{credits == null ? '' : `利用可能 ${cr(credits)}。`}</Copy>
          <Copy>対象外や不鮮明と判定された画像も、解析できた分はCRを消費します。送信前に画像とページ順をご確認ください。</Copy>
          {credits !== null && estimate != null && estimate > credits ? <>
            <Notice text="送信に必要なCRが不足しています。" />
            <Action label="残高を更新" onPress={() => void refreshAndroidAccount()} disabled={busy} />
          </> : null}
          {message ? <Notice text={message} /> : null}
          <Action primary label={busy ? '処理中…' : '確認して送信'}
            disabled={!canPick || estimate == null || (credits !== null && estimate > credits)}
            onPress={() => {
              if (estimate == null) return;
              Alert.alert('画像を送信しますか？', `画像を解析用サーバーに送信し、最大 ${cr(estimate)} を確保します。対象外・不鮮明の判定も精算対象になります。`, [
                { text: 'キャンセル', style: 'cancel' }, { text: '送信', onPress: () => void send() },
              ]);
            }} />
        </Surface> : null}
      </>}
      <Modal visible={Boolean(preview)} onRequestClose={() => setPreview(undefined)} animationType="fade">
        <View style={[styles.modal, { backgroundColor: p.bg }]}>
          {preview ? <Image source={{ uri: preview.uri }} style={styles.fullPreview} resizeMode="contain"
            accessibilityLabel={preview.name} /> : null}
          <Action primary label="閉じる" onPress={() => setPreview(undefined)} />
        </View>
      </Modal>
    </Page>
  );
}

function DocumentResult({ document }: { document: ReceiptDocument }) {
  const p = usePalette();
  const amount = receiptExpenseAmount(document);
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
      {document.items.map((item, index) => (
        <Copy key={index}>{item.name ?? '品目不明'} · {resultAmount(document, item.amount_minor)}</Copy>
      ))}
      {document.payments.map((payment, index) => (
        <Copy key={index}>{payment.payment_label ?? payment.brand ?? payment.method ?? '支払い方法不明'}
          {payment.last_four ? `（下4桁 ${payment.last_four}）` : ''} · {resultAmount(document, payment.amount_minor)}</Copy>
      ))}
      {amount ? <Action label="支出の入力に反映" onPress={() => router.push({
        pathname: '/add', params: { receiptAmount: amount, receiptDate: document.date ?? '', receiptTitle: document.merchant ?? '' },
      })} /> : null}
    </View>
  );
}

function Page({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={styles.content}>{children}</ScrollView>;
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
  surface: { padding: 16, gap: 10 },
  heading: { fontSize: 17, fontWeight: '700' },
  estimate: { fontSize: 27, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
