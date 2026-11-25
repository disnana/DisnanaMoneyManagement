import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inspectReceiptFile, removeReceiptFile } from '@/lib/receiptDraftFiles';
import { useAppReducedMotion } from '@/lib/motionPref';
import { metrics, usePalette } from '@/lib/theme';

export type ReceiptImageSource = {
  uri: string;
  name?: string;
  width: number;
  height: number;
  kind: 'camera' | 'gallery' | 'file';
};

const pickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  exif: false,
  quality: 1,
} satisfies ImagePicker.ImagePickerOptions;

function sources(result: ImagePicker.ImagePickerResult, kind: ReceiptImageSource['kind']): ReceiptImageSource[] {
  return result.canceled ? [] : result.assets.map((asset) => ({
    uri: asset.uri, name: asset.fileName ?? undefined, width: asset.width, height: asset.height, kind,
  }));
}

export async function openReceiptCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error(permission.canAskAgain ? '撮影するにはカメラへのアクセスを許可してください。'
    : '端末の設定でカメラを許可すると撮影できます。');
  try {
    return sources(await ImagePicker.launchCameraAsync({ ...pickerOptions, cameraType: ImagePicker.CameraType.back }), 'camera');
  } catch {
    throw new Error('カメラを起動できませんでした。写真かファイルから画像を選べます。');
  }
}

export async function openReceiptGallery(selectionLimit: number) {
  if (!Number.isSafeInteger(selectionLimit) || selectionLimit < 1) return [];
  const selected = sources(await ImagePicker.launchImageLibraryAsync({
    ...pickerOptions, allowsMultipleSelection: selectionLimit > 1, selectionLimit,
  }), 'gallery');
  if (selected.length > selectionLimit) {
    selected.forEach((image) => removeReceiptFile(image.uri));
    throw new Error(`一度に選べる写真は ${selectionLimit} 枚です。`);
  }
  return selected;
}

type Size = { width: number; height: number };
type Crop = { left: number; top: number; right: number; bottom: number };
const full: Crop = { left: 0, top: 0, right: 1, bottom: 1 };
const workingEdge = 4096;
const previewEdge = 1280;
const handleSize = 48;
const noSize: Size = { width: 0, height: 0 };

function scaledSize(size: Size, longest: number, pixels = Infinity): Size {
  const scale = Math.min(1, longest / Math.max(size.width, size.height), Math.sqrt(pixels / (size.width * size.height)));
  const width = Math.max(1, Math.floor(size.width * scale));
  const height = Math.max(1, Math.floor(size.height * scale));
  // Rounding up a width or height of less than one pixel can exceed the area limit on a very thin source.
  return height > width ? { width, height: Math.min(height, Math.floor(pixels / width)) }
    : { width: Math.min(width, Math.floor(pixels / height)), height };
}

function cropPixels(frame: Crop, size: Size) {
  const originX = Math.min(size.width - 1, Math.floor(frame.left * size.width));
  const originY = Math.min(size.height - 1, Math.floor(frame.top * size.height));
  return {
    originX, originY,
    width: Math.max(1, Math.ceil(frame.right * size.width) - originX),
    height: Math.max(1, Math.ceil(frame.bottom * size.height) - originY),
  };
}

async function saveReceiptCopy(image: ImageRef, frame: Crop, format: SaveFormat, maxBytes: number, maxPixels: number) {
  const pixels = cropPixels(frame, image);
  const originalSize = scaledSize(pixels, workingEdge, maxPixels);
  const tuning = format === SaveFormat.PNG ? [[1, 1], [0.84, 1], [0.7, 1], [0.55, 1]]
    : [[1, 0.94], [1, 0.84], [0.84, 0.84], [0.7, 0.8], [0.55, 0.78]];
  for (const [scale, compress] of tuning) {
    const size = scaledSize(originalSize, Math.floor(Math.max(originalSize.width, originalSize.height) * scale));
    const context = ImageManipulator.manipulate(image);
    let rendered: ImageRef | undefined;
    try {
      if (frame !== full) context.crop(pixels);
      if (size.width !== pixels.width || size.height !== pixels.height) context.resize(size);
      rendered = await context.renderAsync();
      const { uri } = await rendered.saveAsync({ format, compress });
      const file = new File(uri);
      if (file.exists && file.size > 0 && file.size <= maxBytes && rendered.width * rendered.height <= maxPixels) return uri;
      removeReceiptFile(uri);
    } finally {
      rendered?.release();
      context.release();
    }
  }
  throw new Error('送信できるサイズに収まりません。余白を切り取るか、長い書類は分けて撮ってください。');
}

type Corner = { x: 'left' | 'right'; y: 'top' | 'bottom'; label: string };
const corners: Corner[] = [
  { x: 'left', y: 'top', label: '左上' }, { x: 'right', y: 'top', label: '右上' },
  { x: 'left', y: 'bottom', label: '左下' }, { x: 'right', y: 'bottom', label: '右下' },
];
const accessibilityActions = [
  { name: 'increment', label: '範囲を広げる' }, { name: 'decrement', label: '範囲を狭める' },
  { name: 'left', label: '左へ移動' }, { name: 'right', label: '右へ移動' },
  { name: 'up', label: '上へ移動' }, { name: 'down', label: '下へ移動' },
];
const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number));

function moveCorner(start: Crop, { x, y }: Corner, dx: number, dy: number, canvas: Size): Crop {
  const minWidth = Math.min(0.48, 24 / canvas.width);
  const minHeight = Math.min(0.48, 24 / canvas.height);
  const nextX = x === 'left' ? clamp(start.left + dx, 0, start.right - minWidth)
    : clamp(start.right + dx, start.left + minWidth, 1);
  const nextY = y === 'top' ? clamp(start.top + dy, 0, start.bottom - minHeight)
    : clamp(start.bottom + dy, start.top + minHeight, 1);
  return { ...start, [x]: nextX, [y]: nextY };
}

function CropHandle({ corner, crop, canvas, setCrop, disabled }: {
  corner: Corner; crop: Crop; canvas: Size; setCrop: (frame: Crop) => void; disabled: boolean;
}) {
  const current = useRef(crop);
  current.current = crop;
  const start = useRef(crop);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = current.current; },
    onPanResponderMove: (_, gesture) => setCrop(moveCorner(start.current, corner,
      gesture.dx / canvas.width, gesture.dy / canvas.height, canvas)),
  }), [canvas, corner, disabled, setCrop]);
  return <View {...pan.panHandlers}
    accessible accessibilityRole="adjustable" accessibilityLabel={`切り取り枠の${corner.label}`}
    accessibilityValue={{ text: `横 ${Math.round(crop[corner.x] * 100)}%、縦 ${Math.round(crop[corner.y] * 100)}%` }}
    accessibilityState={{ disabled }} accessibilityActions={accessibilityActions}
    onAccessibilityAction={({ nativeEvent: { actionName } }) => {
      if (disabled) return;
      const step = 0.04;
      const amount = actionName === 'increment' ? step : actionName === 'decrement' ? -step : 0;
      const dx = actionName === 'left' ? -step : actionName === 'right' ? step : corner.x === 'left' ? -amount : amount;
      const dy = actionName === 'up' ? -step : actionName === 'down' ? step : corner.y === 'top' ? -amount : amount;
      setCrop(moveCorner(current.current, corner, dx, dy, canvas));
    }}
    style={[styles.handle, { left: crop[corner.x] * canvas.width, top: crop[corner.y] * canvas.height }]}>
    <View style={styles.handleDot} />
  </View>;
}

function CropFrame({ uri, crop, canvas, disabled, setCrop }: {
  uri: string; crop: Crop; canvas: Size; disabled: boolean; setCrop: (frame: Crop) => void;
}) {
  const left = crop.left * canvas.width;
  const top = crop.top * canvas.height;
  const width = (crop.right - crop.left) * canvas.width;
  const height = (crop.bottom - crop.top) * canvas.height;
  return <View style={[styles.canvas, { width: canvas.width + handleSize, height: canvas.height + handleSize }]}>
    <View style={[styles.imageBounds, canvas]}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, canvas]} resizeMode="stretch" accessibilityLabel="書類の画像" />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, right: 0, height: top }]} />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top: top + height, right: 0, bottom: 0 }]} />
      <View pointerEvents="none" style={[styles.shade, { left: 0, top, width: left, height }]} />
      <View pointerEvents="none" style={[styles.shade, { left: left + width, top, right: 0, height }]} />
      <View pointerEvents="none" style={[styles.frame, { left, top, width, height }]}>
        {[1 / 3, 2 / 3].map((part) => <View key={part} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.grid, { left: width * part, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
          <View style={[styles.grid, { left: 0, right: 0, top: height * part, height: StyleSheet.hairlineWidth }]} />
        </View>)}
      </View>
    </View>
    {corners.map((corner) => <CropHandle key={corner.label} corner={corner} crop={crop}
      canvas={canvas} disabled={disabled} setCrop={setCrop} />)}
  </View>;
}

export function ReceiptImageEditor({ source, maxBytes, maxPixels, onConfirm, onClose, onReplace }: {
  source: ReceiptImageSource;
  maxBytes: number;
  maxPixels: number;
  onConfirm: (uri: string) => void | Promise<void>;
  onClose: () => void;
  onReplace?: () => Promise<ReceiptImageSource | undefined>;
}) {
  const p = usePalette();
  const reduceMotion = useAppReducedMotion();
  const [preview, setPreview] = useState<{ uri: string; size: Size }>();
  const [crop, setCrop] = useState(full);
  const [viewport, setViewport] = useState(noSize);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const processing = useRef(false);
  const image = useRef<ImageRef | undefined>(undefined);
  const savingImage = useRef<ImageRef | undefined>(undefined);
  const outFormat = useRef(SaveFormat.JPEG);
  const uri = source.uri;

  useEffect(() => {
    setPreview(undefined);
    setCrop(full);
    setMessage('');
    setLoading(true);
    let live = true;
    let raw: ImageRef | undefined;
    let previewURI: string | undefined;
    active.current = true;
    async function prepare() {
      let decode: ReturnType<typeof ImageManipulator.manipulate> | undefined;
      try {
        const file = await inspectReceiptFile(uri).catch(() => undefined);
        const format = file?.type === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG;
        if (!live) return;
        decode = ImageManipulator.manipulate(uri, { maxWidth: workingEdge, maxHeight: workingEdge });
        raw = await decode.renderAsync();
        if (!live) return;
        const ctx = ImageManipulator.manipulate(raw);
        let rendered: ImageRef | undefined;
        try {
          rendered = await ctx.resize(scaledSize(raw, previewEdge)).renderAsync();
          if (!live) return;
          previewURI = (await rendered.saveAsync({ format, compress: 0.84 })).uri;
          if (!live) {
            removeReceiptFile(previewURI);
            return;
          }
          image.current = raw;
          outFormat.current = format;
          setPreview({ uri: previewURI, size: { width: raw.width, height: raw.height } });
        } finally {
          rendered?.release();
          ctx.release();
        }
      } catch {
        if (live) setMessage('画像を表示できませんでした。撮り直すか、別の画像を選んでください。');
      } finally {
        decode?.release();
        if (live) setLoading(false);
        if (image.current !== raw) raw?.release();
      }
    }
    void prepare();
    return () => {
      active.current = false;
      live = false;
      if (image.current === raw) {
        image.current = undefined;
        if (savingImage.current !== raw) raw?.release();
      }
      if (previewURI) removeReceiptFile(previewURI);
    };
  }, [uri]);

  function layout({ nativeEvent: { layout: next } }: LayoutChangeEvent) {
    setViewport((previous) => previous.width === next.width && previous.height === next.height ? previous
      : { width: next.width, height: next.height });
  }

  const canvas = useMemo(() => {
    if (!preview || viewport.width <= handleSize || viewport.height <= handleSize) return noSize;
    const scale = Math.min((viewport.width - handleSize) / preview.size.width, (viewport.height - handleSize) / preview.size.height);
    return { width: scale * preview.size.width, height: scale * preview.size.height };
  }, [preview, viewport]);

  function close() {
    if (!processing.current) onClose();
  }

  async function confirm(frame: Crop) {
    if (processing.current || !image.current) return;
    processing.current = true;
    setBusy(true);
    setMessage('');
    const raw = image.current;
    savingImage.current = raw;
    let confirmed: string | undefined;
    try {
      confirmed = await saveReceiptCopy(raw, frame, outFormat.current, maxBytes, maxPixels);
      if (active.current && image.current === raw) {
        await onConfirm(confirmed);
        confirmed = undefined;
      }
    } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : '画像を保存できませんでした。');
    } finally {
      if (confirmed) removeReceiptFile(confirmed);
      savingImage.current = undefined;
      if (image.current !== raw) raw.release();
      processing.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function replace() {
    if (processing.current || !onReplace) return;
    processing.current = true;
    setBusy(true);
    setMessage('');
    try {
      await onReplace();
    } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : '画像を選び直せませんでした。');
    } finally {
      processing.current = false;
      if (active.current) setBusy(false);
    }
  }

  const adjusted = crop.left > 0 || crop.top > 0 || crop.right < 1 || crop.bottom < 1;
  return <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
    <SafeAreaView accessibilityViewIsModal style={[styles.root, { backgroundColor: p.bg }]}>
      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.titleBox}>
            <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>画像の範囲を調整</Text>
            <Text style={[styles.help, { color: p.textSecondary }]}>四隅の丸を動かして、使う範囲を選びます。</Text>
          </View>
          <EditorButton label="閉じる" onPress={close} disabled={busy} />
        </View>
        <View style={styles.viewer} onLayout={layout}>
          {loading ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="画像を読み込み中" /> : null}
          {preview && canvas.width > 0 ? <CropFrame uri={preview.uri} crop={crop} canvas={canvas} disabled={busy} setCrop={setCrop} /> : null}
        </View>
        <View style={styles.footer}>
          {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.help, { color: p.danger }]}>{message}</Text> : null}
          {busy ? <ActivityIndicator color={p.tint} accessibilityLabel="画像を処理中" /> : null}
          <View style={styles.tools}>
            {onReplace ? <EditorButton label={source.kind === 'camera' ? '撮り直す' : '選び直す'} onPress={() => void replace()} disabled={busy} /> : null}
            <EditorButton label="枠を戻す" onPress={() => setCrop(full)} disabled={busy || !adjusted} />
          </View>
          <EditorButton primary label={adjusted ? 'この範囲を使う' : '画像全体を使う'}
            onPress={() => void confirm(adjusted ? crop : full)} disabled={busy || !preview || !canvas.width} />
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function EditorButton({ label, onPress, primary, disabled }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, {
      backgroundColor: primary ? p.tint : p.fill, opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
    }]}>
    <Text style={[styles.buttonLabel, { color: primary ? p.onTint : p.tint }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  editorContent: { flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  titleBox: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  help: { fontSize: 13, lineHeight: 18 },
  viewer: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161A1A' },
  canvas: { position: 'relative' },
  imageBounds: { position: 'absolute', left: handleSize / 2, top: handleSize / 2, backgroundColor: '#FFFFFF' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.56)' },
  frame: { position: 'absolute', borderColor: '#FFFFFF', borderWidth: 1.5 },
  grid: { position: 'absolute', backgroundColor: 'rgba(31, 36, 36, 0.52)' },
  handle: { position: 'absolute', height: handleSize, width: handleSize, alignItems: 'center', justifyContent: 'center' },
  handleDot: { height: 18, width: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#176961' },
  footer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 14, paddingVertical: 6,
    flexShrink: 1, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.controlRadius },
  buttonLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
