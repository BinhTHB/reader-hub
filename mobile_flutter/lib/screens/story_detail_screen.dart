import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/supabase_service.dart';
import '../services/r2_service.dart';
import 'reader_screen.dart';

class StoryDetailScreen extends StatefulWidget {
  final String slug;

  const StoryDetailScreen({super.key, required this.slug});

  @override
  State<StoryDetailScreen> createState() => _StoryDetailScreenState();
}

class _StoryDetailScreenState extends State<StoryDetailScreen> {
  Map<String, dynamic>? _story;
  List<Map<String, dynamic>> _chapters = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadStoryData();
  }

  Future<void> _loadStoryData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final story = await SupabaseService.getStoryBySlug(widget.slug);
      if (story == null) {
        throw Exception('Không tìm thấy truyện');
      }

      final chapters = await SupabaseService.getChaptersByStoryId(story['id']);

      setState(() {
        _story = story;
        _chapters = chapters;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A2E),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          _story?['title'] ?? 'Chi tiết truyện',
          style: const TextStyle(color: Colors.white),
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF6366F1)),
            )
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Lỗi: $_errorMessage',
                        style: const TextStyle(color: Colors.red),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadStoryData,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildStoryHeader(),
                      const SizedBox(height: 24),
                      _buildChapterList(),
                    ],
                  ),
                ),
    );
  }

  Widget _buildStoryHeader() {
    final coverUrl = _story!['cover_url'] != null
        ? R2Service.getCoverUrl(_story!['cover_url'])
        : null;

    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 120,
              height: 160,
              child: coverUrl != null
                  ? CachedNetworkImage(
                      imageUrl: coverUrl,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(
                        color: const Color(0xFF2A2A3E),
                        child: const Center(
                          child: CircularProgressIndicator(
                            color: Color(0xFF6366F1),
                          ),
                        ),
                      ),
                      errorWidget: (context, url, error) => Container(
                        color: const Color(0xFF2A2A3E),
                        child: const Icon(Icons.book, color: Colors.grey, size: 48),
                      ),
                    )
                  : Container(
                      color: const Color(0xFF2A2A3E),
                      child: const Icon(Icons.book, color: Colors.grey, size: 48),
                    ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _story!['title'] ?? '',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Tác giả: ${_story!['author'] ?? 'Không rõ'}',
                  style: TextStyle(color: Colors.grey[400], fontSize: 14),
                ),
                const SizedBox(height: 4),
                Text(
                  'Trạng thái: ${_story!['status'] ?? 'Không rõ'}',
                  style: TextStyle(color: Colors.grey[400], fontSize: 14),
                ),
                const SizedBox(height: 8),
                if (_story!['genres'] != null)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: ((_story!['genres'] as List?) ?? [])
                        .map((genre) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFF6366F1).withOpacity(0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                genre.toString(),
                                style: const TextStyle(
                                  color: Color(0xFF6366F1),
                                  fontSize: 12,
                                ),
                              ),
                            ))
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChapterList() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Danh sách chương (${_chapters.length})',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _chapters.length,
            itemBuilder: (context, index) {
              final chapter = _chapters[index];
              return _ChapterItem(
                chapter: chapter,
                storyTitle: _story!['title'],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ChapterItem extends StatelessWidget {
  final Map<String, dynamic> chapter;
  final String storyTitle;

  const _ChapterItem({required this.chapter, required this.storyTitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ReaderScreen(
                chapter: chapter,
                storyTitle: storyTitle,
              ),
            ),
          );
        },
        title: Text(
          chapter['title'] ?? 'Chương ${chapter['chapter_number']}',
          style: const TextStyle(color: Colors.white, fontSize: 14),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
      ),
    );
  }
}
