import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

class R2Service {
  static final Map<String, ChapterContent> _cache = {};

  static Future<ChapterContent> fetchChapterContent(String r2Url) async {
    // Check cache first
    if (_cache.containsKey(r2Url)) {
      return _cache[r2Url]!;
    }

    // Fetch from R2
    final response = await http.get(Uri.parse(r2Url));
    
    if (response.statusCode != 200) {
      throw Exception('Failed to fetch chapter content: ${response.statusCode}');
    }

    final json = jsonDecode(utf8.decode(response.bodyBytes));
    final content = ChapterContent.fromJson(json);

    // Cache it
    _cache[r2Url] = content;

    return content;
  }

  static void clearCache() {
    _cache.clear();
  }

  static String getCoverUrl(String coverPath) {
    return '${AppConfig.r2PublicDomain}/$coverPath';
  }
}

class ChapterContent {
  final String title;
  final int chapterNumber;
  final List<String> paragraphs;
  final int wordCount;

  ChapterContent({
    required this.title,
    required this.chapterNumber,
    required this.paragraphs,
    required this.wordCount,
  });

  factory ChapterContent.fromJson(Map<String, dynamic> json) {
    return ChapterContent(
      title: json['title'] ?? '',
      chapterNumber: json['chapter_number'] ?? 0,
      paragraphs: List<String>.from(json['paragraphs'] ?? []),
      wordCount: json['word_count'] ?? 0,
    );
  }

  String get fullText => paragraphs.join('\n\n');
}
