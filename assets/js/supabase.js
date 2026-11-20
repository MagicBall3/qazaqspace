/**
 * QAZAQ SPACE — Supabase integration.
 * Cloud sync: profile, progress, games, stats, media posts, leaderboard.
 */
import { supabase } from './supabase-client.js';

let currentUser = null;
let currentProfile = null;

/* ---------------------------------------------------------------- */
/* Auth                                                             */
/* ---------------------------------------------------------------- */

export async function signUp(email, password, username, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { username: username || 'user_' + Math.random().toString(36).slice(2, 8), display_name: displayName || username || email.split('@')[0] } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  await loadProfile();
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
  currentProfile = null;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadProfile();
    else currentProfile = null;
    callback(currentUser, currentProfile);
  });
}

export function getCurrentUser() { return currentUser; }
export function getCurrentProfile() { return currentProfile; }

/* ---------------------------------------------------------------- */
/* Profile                                                          */
/* ---------------------------------------------------------------- */

export async function loadProfile() {
  if (!currentUser) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
  currentProfile = data || null;
  return currentProfile;
}

export async function updateProfile(updates) {
  if (!currentUser) throw new Error('NOT_AUTHENTICATED');
  const allowed = {};
  if (updates.username) allowed.username = updates.username;
  if (updates.display_name) allowed.display_name = updates.display_name;
  if (updates.avatar_url !== undefined) allowed.avatar_url = updates.avatar_url;
  const { data, error } = await supabase.from('profiles').update(allowed).eq('id', currentUser.id).select().single();
  if (error) throw error;
  currentProfile = data;
  return data;
}

/* ---------------------------------------------------------------- */
/* Progress sync                                                    */
/* ---------------------------------------------------------------- */

export async function syncLessonCompletion(lessonId, score, total, xp = 20) {
  if (!currentUser) return { success: false, offline: true };
  try {
    const { data } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId, p_score: score, p_total: total, p_xp: xp });
    return { success: true, data };
  } catch (err) { console.warn('Lesson sync failed', err); return { success: false, offline: true }; }
}

export async function syncGameResult(gameId, score, maxScore, xp = 10) {
  if (!currentUser) return { success: false, offline: true };
  try {
    const { data } = await supabase.rpc('record_game_result', { p_game_id: gameId, p_score: score, p_max: maxScore, p_xp: xp });
    return { success: true, data };
  } catch (err) { console.warn('Game sync failed', err); return { success: false, offline: true }; }
}

/* ---------------------------------------------------------------- */
/* Media Lab                                                        */
/* ---------------------------------------------------------------- */

export async function createPost(title, content, postType = 'text') {
  if (!currentUser) throw new Error('NOT_AUTHENTICATED');
  const { data, error } = await supabase.from('media_posts').insert({ author_id: currentUser.id, title, content, post_type: postType, status: 'pending' }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePost(postId, updates) {
  if (!currentUser) throw new Error('NOT_AUTHENTICATED');
  const { data, error } = await supabase.from('media_posts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', postId).eq('author_id', currentUser.id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePost(postId) {
  if (!currentUser) throw new Error('NOT_AUTHENTICATED');
  const { error } = await supabase.from('media_posts').delete().eq('id', postId).eq('author_id', currentUser.id);
  if (error) throw error;
}

export async function fetchFeed() {
  const { data, error } = await supabase.from('media_posts').select('*, author:profiles(id, username, display_name, avatar_url)').eq('status', 'approved').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchMyPosts() {
  if (!currentUser) return [];
  const { data } = await supabase.from('media_posts').select('*').eq('author_id', currentUser.id).order('created_at', { ascending: false });
  return data || [];
}

/* ---------------------------------------------------------------- */
/* Leaderboard                                                      */
/* ---------------------------------------------------------------- */

export async function fetchLeaderboard(limit = 50) {
  const { data, error } = await supabase.from('user_stats').select('user_id, total_xp, completed_lessons, completed_games, achievements_count, profile:profiles(username, display_name, avatar_url)').order('total_xp', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchMyRank() {
  if (!currentUser) return null;
  const { data } = await supabase.from('user_stats').select('user_id, total_xp').order('total_xp', { ascending: false });
  const rank = (data || []).findIndex((row) => row.user_id === currentUser.id);
  return { rank: rank + 1, totalXP: data?.[rank]?.total_xp || 0 };
}