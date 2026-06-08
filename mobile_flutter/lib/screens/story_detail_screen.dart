import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../services/supabase_service.dart';
import '../services/r2_service.dart';
import '../theme.dart';

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
  bool _isLoadingChapters = false;
  String? _errorMessage;
  bool _showFullDescription = false;

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

      setState(() {
        _story = story;
        _isLoading = false;
      });

      _loadChapters();
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _loadChapters() async {
    if (_story == null) return;

    setState(() {
      _isLoadingChapters = true;
    });

    try {
      final chapters = await SupabaseService.getChaptersByStoryId(_story!['id']);
      setState(() {
        _chapters = chapters;
        _isLoadingChapters = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingChapters = false;
      });
    }
  }

  Future<void> _confirmDeleteStory(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xac nhan xoa'),
        content: Text('Ban co chac chan muon xoa truyen "' + (_story!['title'] ?? '') + '"? Toan bo chuong va du lieu lien quan se bi xoa vinh vien.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Huy'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Xoa'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await SupabaseService.deleteStory(_story!['id']);
        if (context.mounted) {
          Navigator.of(context).pop();
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Loi khi xoa truyen: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  Future<void> _confirmDeleteChapter(BuildContext context, Map<String, dynamic> chapter) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xac nhan xoa'),
        content: Text('Ban co chac chan muon xoa "Chuong ' + chapter['chapter_number'].toString() + ': ' + (chapter['title'] ?? 'Chuong ' + chapter['chapter_number'].toString()) + '"? Hanh dong nay khong the hoan tac.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Huy'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Xoa'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await SupabaseService.deleteChapter(chapter['id']);
        setState(() {
          _chapters.removeWhere((ch) => ch['id'] == chapter['id']);
        });
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Da xoa chuong thanh cong'), backgroundColor: Colors.green),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Loi khi xoa chuong: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primary),
            )
          : _errorMessage != null
              ? _buildError()
              : _buildContent(),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Column(
                children: [
                  Text(
                    'Lỗi: $_errorMessage',
                    style: TextStyle(color: Colors.red.shade600),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _loadStoryData,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade600,
                    ),
                    child: const Text('Thử lại'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    final coverUrl = _story!['cover_url'] != null
        ? R2Service.getCoverUrl(_story!['cover_url'])
        : null;

    return CustomScrollView(
      slivers: [
        // App Bar
        SliverAppBar(
          backgroundColor: AppTheme.background,
          foregroundColor: AppTheme.foreground,
          elevation: 0,
          pinned: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.favorite_border),
              onPressed: () {
                // TODO: Add to favorites
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.red),
              onPressed: () => _confirmDeleteStory(context),
            ),
            IconButton(
              icon: const Icon(Icons.share),
              onPressed: () {
                // TODO: Share
              },
            ),
          ],
        ),

        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Cover & Meta
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Cover
                    Container(
                      width: 128,
                      height: 192,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: coverUrl != null
                            ? CachedNetworkImage(
                                imageUrl: coverUrl,
                                fit: BoxFit.cover,
                                placeholder: (context, url) => Container(
                                  color: AppTheme.muted,
                                  child: const Center(
                                    child: CircularProgressIndicator(
                                      color: AppTheme.primary,
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ),
                                errorWidget: (context, url, error) => Container(
                                  color: AppTheme.muted,
                                  child: const Icon(Icons.book, color: AppTheme.mutedForeground),
                                ),
                              )
                            : Container(
                                color: AppTheme.muted,
                                child: const Icon(Icons.book, color: AppTheme.mutedForeground),
                              ),
                      ),
                    ),

                    const SizedBox(width: 16),

                    // Meta
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _story!['title'] ?? 'Không có tiêu đề',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _story!['author'] ?? 'Đang cập nhật',
                            style: const TextStyle(
                              fontSize: 14,
                              color: AppTheme.mutedForeground,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Text(
                                '${_story!['total_chapters'] ?? _chapters.length} chương',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: AppTheme.mutedForeground,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text('•', style: TextStyle(color: AppTheme.mutedForeground)),
                              const SizedBox(width: 8),
                              Text(
                                _story!['status'] ?? 'ongoing',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: AppTheme.mutedForeground,
                                ),
                              ),
                            ],
                          ),
                          if (_story!['genres'] != null && (_story!['genres'] as List).isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: (_story!['genres'] as List).take(2).map((genre) {
                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primary.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    genre,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppTheme.primary,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Action Buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _chapters.isEmpty
                            ? null
                            : () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ReaderScreen(
                                      chapter: _chapters[0],
                                      storyTitle: _story!['title'],
                                    ),
                                  ),
                                );
                              },
                        icon: const Icon(Icons.book_outlined),
                        label: Text(_chapters.isEmpty ? 'Chưa có chương' : 'Bắt đầu đọc'),
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      decoration: BoxDecoration(
                        color: AppTheme.muted,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.download),
                        onPressed: () {
                          // TODO: Download
                        },
                      ),
                    ),
                  ],
                ),

                // Description
                if (_story!['description'] != null && _story!['description'].toString().isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text(
                    'Mô tả',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _story!['description'],
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppTheme.mutedForeground,
                            height: 1.6,
                          ),
                          maxLines: _showFullDescription ? null : 3,
                          overflow: _showFullDescription ? null : TextOverflow.ellipsis,
                        ),
                        if (_story!['description'].toString().length > 150) ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _showFullDescription = !_showFullDescription;
                              });
                            },
                            style: TextButton.styleFrom(
                              foregroundColor: AppTheme.primary,
                              padding: EdgeInsets.zero,
                            ),
                            child: Text(_showFullDescription ? 'Thu gọn' : 'Xem thêm'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],

                // Chapter List
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Danh sách chương (${_chapters.length})',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (_isLoadingChapters)
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          color: AppTheme.primary,
                          strokeWidth: 2,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                if (_isLoadingChapters)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(color: AppTheme.primary),
                    ),
                  )
                else if (_chapters.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Chưa có chương nào',
                        style: const TextStyle(color: AppTheme.mutedForeground),
                      ),
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _chapters.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final chapter = _chapters[index];
                      return _ChapterItem(
                        chapter: chapter,
                        storyTitle: _story!['title'],
                        onDelete: () => _confirmDeleteChapter(context, chapter),
                      );
                    },
                  ),

                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ChapterItem extends StatelessWidget {
  final Map<String, dynamic> chapter;
  final String storyTitle;
  final VoidCallback? onDelete;

  const _ChapterItem({
    required this.chapter,
    required this.storyTitle,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
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
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Chương ${chapter['chapter_number']}: ${chapter['title'] ?? 'Chương ${chapter['chapter_number']}'}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    DateTime.parse(chapter['created_at']).toString().split(' ')[0],
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.book_outlined,
              size: 16,
              color: AppTheme.mutedForeground,
            ),
          ],
        ),
      ),
    );
  }
}
