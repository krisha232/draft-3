import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// ---------- Private file links ----------
// Files are private, so each one needs a short-lived signed link.
// Requests made in the same moment are batched into one call and cached.

const TTL = 3600; // seconds
const cache = new Map(); // "bucket:path" -> { url, expires } | { promise }
const queued = new Map(); // bucket -> Map(path -> [resolve])

function fresh(hit) {
  return hit && hit.url && hit.expires > Date.now() + 60_000;
}

export function signedUrl(bucket, path) {
  const key = `${bucket}:${path}`;
  const hit = cache.get(key);
  if (fresh(hit)) return Promise.resolve(hit.url);
  if (hit?.promise) return hit.promise;

  const promise = new Promise((resolve) => {
    if (!queued.has(bucket)) {
      queued.set(bucket, new Map());
      setTimeout(() => flush(bucket), 0);
    }
    const q = queued.get(bucket);
    if (!q.has(path)) q.set(path, []);
    q.get(path).push(resolve);
  });
  cache.set(key, { promise });
  return promise;
}

async function flush(bucket) {
  const q = queued.get(bucket);
  queued.delete(bucket);
  const paths = [...q.keys()];
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, TTL);
  const byPath = new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  for (const p of paths) {
    const url = byPath.get(p) || null;
    const key = `${bucket}:${p}`;
    if (url) cache.set(key, { url, expires: Date.now() + TTL * 1000 });
    else cache.delete(key);
    q.get(p).forEach((resolve) => resolve(url));
  }
}

export function useSignedUrl(bucket, path) {
  const [url, setUrl] = useState(() => {
    const hit = path && cache.get(`${bucket}:${path}`);
    return fresh(hit) ? hit.url : null;
  });
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let alive = true;
    signedUrl(bucket, path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return path ? url : null;
}

// ---------- Profile photos ----------

// Crop to a square and shrink to 512px so photos load fast.
export async function prepareAvatar(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('That photo couldn\u2019t be read. Use a JPG or PNG image.');
  }
  const side = Math.min(bmp.width, bmp.height);
  const size = Math.min(512, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

export async function uploadAvatar(userId, file, oldPath) {
  const blob = await prepareAvatar(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
  if (upErr) throw upErr;
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return path;
}

export async function removeAvatar(userId, oldPath) {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
}

// ---------- Post attachments ----------

export const MAX_FILES = 4;
export const MAX_SIZE = 10 * 1024 * 1024;
export const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
export const ACCEPT = ALLOWED_TYPES.join(',') + ',.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

export function checkFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${file.name}: only photos, PDFs, Word, Excel, PowerPoint and text files can be attached.`;
  }
  if (file.size > MAX_SIZE) return `${file.name} is larger than 10 MB.`;
  return null;
}

export const isImage = (type) => /^image\//.test(type || '');

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(name) {
  return name.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'file';
}

// Upload all files; if any fails, remove the ones already uploaded.
export async function uploadAttachments(userId, files) {
  const done = [];
  try {
    for (const file of files) {
      const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type });
      if (error) throw new Error(`${file.name} couldn\u2019t be uploaded: ${error.message}`);
      done.push({ path, name: file.name.slice(0, 200), type: file.type, size: file.size });
    }
    return done;
  } catch (e) {
    if (done.length) await supabase.storage.from('attachments').remove(done.map((d) => d.path));
    throw e;
  }
}

export async function deleteAttachments(items) {
  if (items?.length) await supabase.storage.from('attachments').remove(items.map((a) => a.path));
}
