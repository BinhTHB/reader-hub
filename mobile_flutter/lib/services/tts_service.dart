import 'package:flutter_tts/flutter_tts.dart';

class TtsService {
  static final FlutterTts _tts = FlutterTts();
  static bool _isInitialized = false;

  static Future<void> initialize() async {
    if (_isInitialized) return;

    await _tts.setLanguage('vi-VN');
    await _tts.setSpeechRate(0.5);
    await _tts.setVolume(1.0);
    await _tts.setPitch(1.0);

    _isInitialized = true;
  }

  static Future<void> speak(String text) async {
    if (!_isInitialized) await initialize();
    await _tts.speak(text);
  }

  static Future<void> stop() async {
    await _tts.stop();
  }

  static Future<void> pause() async {
    await _tts.pause();
  }

  static Future<void> setSpeechRate(double rate) async {
    await _tts.setSpeechRate(rate);
  }

  static Future<void> setVolume(double volume) async {
    await _tts.setVolume(volume);
  }

  static void setOnCompleteHandler(Function() callback) {
    _tts.setCompletionHandler(callback);
  }

  static void setOnProgressHandler(Function(String, int, int, String) callback) {
    _tts.setProgressHandler((text, start, end, word) {
      callback(text, start, end, word);
    });
  }

  static Future<bool> get isPlaying async {
    final state = await _tts.awaitSpeakCompletion(true);
    return state == 1;
  }
}
