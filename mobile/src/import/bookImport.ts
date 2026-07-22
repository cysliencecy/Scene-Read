import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  buildImportedBookDraft,
  parseEpubChapters,
  splitTxtChapters,
  type ImportedBookDraft,
} from './bookParser';

export type { ImportedBookDraft };

const supportedTypes = [
  'text/plain',
  'application/epub+zip',
  'application/octet-stream',
  '.txt',
  '.epub',
];

const readBase64File = async (uri: string) =>
  FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

const readTxtFile = async (uri: string) =>
  FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

const readWebTextFile = async (asset: DocumentPicker.DocumentPickerAsset) => {
  const webFile = asset.file;

  if (!webFile) {
    throw new Error('Web 端没有拿到浏览器文件对象，请重新选择 TXT 文件。');
  }

  return webFile.text();
};

const readWebBase64File = async (asset: DocumentPicker.DocumentPickerAsset) => {
  const webFile = asset.file;

  if (!webFile) {
    throw new Error('Web 端没有拿到浏览器文件对象，请重新选择 EPUB 文件。');
  }

  const buffer = await webFile.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return globalThis.btoa(binary);
};

export async function pickAndParseBook(): Promise<ImportedBookDraft | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: supportedTypes,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name || '未命名书籍';
  const lowerName = fileName.toLowerCase();
  const fileType = lowerName.endsWith('.epub') ? 'EPUB' : 'TXT';

  const parsed =
    fileType === 'EPUB'
      ? await parseEpubChapters(
          Platform.OS === 'web' ? await readWebBase64File(asset) : await readBase64File(asset.uri),
        )
      : {
          title: fileName.replace(/\.[^.]+$/, ''),
          chapters: splitTxtChapters(
            Platform.OS === 'web' ? await readWebTextFile(asset) : await readTxtFile(asset.uri),
          ),
        };

  return buildImportedBookDraft({
    fileName,
    fileSize: asset.size,
    fileType,
    parsedTitle: parsed.title,
    parsedChapters: parsed.chapters,
  });
}
