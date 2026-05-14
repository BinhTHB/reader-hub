"""Test R2 upload functionality"""
import os
import sys
import io
from dotenv import load_dotenv

# Fix encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load environment
load_dotenv('../.env')

from r2_uploader import upload_chapter

def test_upload():
    try:
        url = upload_chapter(
            story_slug='test-story',
            chapter_number=1,
            title='Test Chapter',
            paragraphs=['Paragraph 1', 'Paragraph 2'],
            word_count=10
        )
        print('[OK] R2 upload successful')
        print(f'URL: {url}')
        return True
    except Exception as e:
        print(f'[ERROR] R2 upload failed: {e}')
        return False

if __name__ == '__main__':
    success = test_upload()
    sys.exit(0 if success else 1)
