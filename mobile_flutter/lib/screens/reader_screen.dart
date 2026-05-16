import 'package:flutter/material.dart';
import '../services/r2_service.dart';
import '../services/tts_service.dart';

class ReaderScreen extends StatefulWidget {
  final Map<String, dynamic> chapter;
  final String storyTitle;

  const ReaderScreen({
    super.key,
    required this.chapter,
    required this.storyTitle,
  });

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  ChapterContent? _content;
  bool _isLoading = true;
  String? _errorMessage;
  bool _isPlaying = false;
  double _speechRate = 0.5;
  int _currentParagraphIndex = 0;

  @override
  void initState() {
    super.initState();
    print('ReaderScreen initState called for chapter: ${widget.chapter['title']}');
    _loadContent();
    _initTts();
  }

  Future<void> _loadContent() async {
    print('ReaderScreen _loadContent started');
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final String? r2Url = widget.chapter['text_r2_url'];
      if (r2Url == null || r2Url.isEmpty) {
        throw Exception('Lỗi: Chương này chưa có nội dung (text_r2_url is null)');
      }
      
      final content = await R2Service.fetchChapterContent(r2Url);
      setState(() {
        _content = content;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _initTts() async {
    await TtsService.initialize();
    TtsService.setOnCompleteHandler(() {
      if (_currentParagraphIndex < (_content?.paragraphs.length ?? 0) - 1) {
        setState(() {
          _currentParagraphIndex++;
        });
        _speakCurrentParagraph();
      } else {
        setState(() {
          _isPlaying = false;
          _currentParagraphIndex = 0;
        });
      }
    });
  }

  Future<void> _speakCurrentParagraph() async {
    if (_content == null || _currentParagraphIndex >= _content!.paragraphs.length) {
      return;
    }
    await TtsService.speak(_content!.paragraphs[_currentParagraphIndex]);
  }

  Future<void> _togglePlayPause() async {
    if (_isPlaying) {
      await TtsService.stop();
      setState(() {
        _isPlaying = false;
      });
    } else {
      setState(() {
        _isPlaying = true;
      });
      await _speakCurrentParagraph();
    }
  }

  Future<void> _stop() async {
    await TtsService.stop();
    setState(() {
      _isPlaying = false;
      _currentParagraphIndex = 0;
    });
  }

  Future<void> _changeSpeechRate(double rate) async {
    await TtsService.setSpeechRate(rate);
    setState(() {
      _speechRate = rate;
    });
  }

  @override
  void dispose() {
    TtsService.stop();
    super.dispose();
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
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.storyTitle,
              style: const TextStyle(color: Colors.white, fontSize: 16),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              _content?.title ?? 'Đang tải...',
              style: TextStyle(color: Colors.grey[400], fontSize: 12),
              overflow: TextOverflow.ellipsis,
            ),
          ],
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
                        onPressed: _loadContent,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : _content == null
                  ? const Center(
                      child: Text(
                        'Không thể tải nội dung chương',
                        style: TextStyle(color: Colors.grey),
                      ),
                    )
                  : Column(
                      children: [
                        Expanded(
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _content?.title ?? 'Không có tiêu đề',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 24,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 24),
                                ...(_content?.paragraphs ?? []).asMap().entries.map((entry) {
                              final index = entry.key;
                              final paragraph = entry.value;
                              final isCurrentParagraph = index == _currentParagraphIndex && _isPlaying;
                              
                              return Container(
                                margin: const EdgeInsets.only(bottom: 16),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: isCurrentParagraph
                                      ? const Color(0xFF6366F1).withOpacity(0.1)
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(8),
                                  border: isCurrentParagraph
                                      ? Border.all(color: const Color(0xFF6366F1), width: 2)
                                      : null,
                                ),
                                child: Text(
                                  paragraph,
                                  style: TextStyle(
                                    color: Colors.grey[300],
                                    fontSize: 16,
                                    height: 1.8,
                                  ),
                                ),
                              );
                            }),
                          ],
                        ),
                      ),
                    ),
                    _buildTtsControls(),
                  ],
                ),
    );
  }

  Widget _buildTtsControls() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A2E),
        boxShadow: [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 8,
            offset: Offset(0, -2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.skip_previous, color: Colors.white, size: 32),
                onPressed: _currentParagraphIndex > 0
                    ? () {
                        setState(() {
                          _currentParagraphIndex--;
                        });
                        if (_isPlaying) {
                          _speakCurrentParagraph();
                        }
                      }
                    : null,
              ),
              const SizedBox(width: 16),
              IconButton(
                icon: Icon(
                  _isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
                  color: const Color(0xFF6366F1),
                  size: 64,
                ),
                onPressed: _togglePlayPause,
              ),
              const SizedBox(width: 16),
              IconButton(
                icon: const Icon(Icons.stop, color: Colors.white, size: 32),
                onPressed: _stop,
              ),
              const SizedBox(width: 16),
              IconButton(
                icon: const Icon(Icons.skip_next, color: Colors.white, size: 32),
                onPressed: _currentParagraphIndex < (_content?.paragraphs.length ?? 0) - 1
                    ? () {
                        setState(() {
                          _currentParagraphIndex++;
                        });
                        if (_isPlaying) {
                          _speakCurrentParagraph();
                        }
                      }
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.speed, color: Colors.grey, size: 20),
              Expanded(
                child: Slider(
                  value: _speechRate,
                  min: 0.3,
                  max: 1.0,
                  divisions: 7,
                  label: '${_speechRate.toStringAsFixed(1)}x',
                  activeColor: const Color(0xFF6366F1),
                  onChanged: _changeSpeechRate,
                ),
              ),
              Text(
                '${_speechRate.toStringAsFixed(1)}x',
                style: const TextStyle(color: Colors.white),
              ),
            ],
          ),
          Text(
            'Đoạn ${_currentParagraphIndex + 1}/${_content?.paragraphs.length ?? 0}',
            style: TextStyle(color: Colors.grey[400], fontSize: 12),
          ),
        ],
      ),
    );
  }
}
