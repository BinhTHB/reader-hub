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
    print('Fetching chapter from R2: $r2Url');
    final response = await http.get(Uri.parse(r2Url));
    
    if (response.statusCode != 200) {
      print('R2 Fetch Error: ${response.statusCode}');
      throw Exception('Failed to fetch chapter content: ${response.statusCode}');
    }

    final decodedBody = utf8.decode(response.bodyBytes);
    print('R2 Response received, length: ${decodedBody.length}');
    
    final json = jsonDecode(decodedBody);
    final content = ChapterContent.fromJson(json);

    // Cache it
    _cache[r2Url] = content;

    return content;
  }

  static void clearCache() {
    _cache.clear();
  }

  static String getCoverUrl(String coverPath) {
    if (coverPath.startsWith('http')) {
      return coverPath;
    }
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
