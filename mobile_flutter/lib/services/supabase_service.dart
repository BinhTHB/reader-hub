import 'package:supabase_flutter/supabase_flutter.dart';
import '../config.dart';

class SupabaseService {
  static SupabaseClient? _client;

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
    );
    _client = Supabase.instance.client;
  }

  static SupabaseClient get client {
    if (_client == null) {
      throw Exception('Supabase not initialized. Call initialize() first.');
    }
    return _client!;
  }

  static User? get currentUser => client.auth.currentUser;
  static bool get isAuthenticated => currentUser != null;

  // Auth methods
  static Future<AuthResponse> signUp(String email, String password) async {
    return await client.auth.signUp(email: email, password: password);
  }

  static Future<AuthResponse> signIn(String email, String password) async {
    return await client.auth.signInWithPassword(email: email, password: password);
  }

  static Future<void> signOut() async {
    await client.auth.signOut();
  }

  // Stories
  static Future<List<Map<String, dynamic>>> getStories({int limit = 20, int offset = 0}) async {
    final response = await client
        .from('stories')
        .select()
        .order('created_at', ascending: false)
        .range(offset, offset + limit - 1);
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<Map<String, dynamic>?> getStoryBySlug(String slug) async {
    final response = await client
        .from('stories')
        .select()
        .eq('slug', slug)
        .maybeSingle();
    return response;
  }

  // Chapters
  static Future<List<Map<String, dynamic>>> getChaptersByStoryId(int storyId) async {
    final response = await client
        .from('chapters')
        .select()
        .eq('story_id', storyId)
        .order('chapter_number', ascending: true);
    return List<Map<String, dynamic>>.from(response);
  }

  // Bookmarks
  static Future<List<Map<String, dynamic>>> getBookmarks() async {
    if (!isAuthenticated) return [];
    final response = await client
        .from('bookmarks')
        .select('*, stories(*)')
        .eq('user_id', currentUser!.id)
        .order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<void> addBookmark(int storyId) async {
    if (!isAuthenticated) throw Exception('User not authenticated');
    await client.from('bookmarks').insert({
      'user_id': currentUser!.id,
      'story_id': storyId,
    });
  }

  static Future<void> removeBookmark(int storyId) async {
    if (!isAuthenticated) throw Exception('User not authenticated');
    await client
        .from('bookmarks')
        .delete()
        .eq('user_id', currentUser!.id)
        .eq('story_id', storyId);
  }

  // Reading history
  static Future<void> updateReadingHistory(int chapterId, double scrollPosition) async {
    if (!isAuthenticated) return;
    await client.from('reading_history').upsert({
      'user_id': currentUser!.id,
      'chapter_id': chapterId,
      'scroll_position': scrollPosition,
      'last_read_at': DateTime.now().toIso8601String(),
    });
  }

  // Delete methods
  static Future<void> deleteStory(int storyId) async {
    await client.from('stories').delete().eq('id', storyId);
  }

  static Future<void> deleteChapter(int chapterId) async {
    await client.from('chapters').delete().eq('id', chapterId);
  }
}
