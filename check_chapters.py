import os
from supabase import create_client

# Load credentials
SUPABASE_URL = "https://gvxzdhufnqhicsgawlyz.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eHpkaHVmbnFoaWNzZ2F3bHl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNzI2OCwiZXhwIjoyMDk0MjgzMjY4fQ.kXp19H1Fkueg4STBu1xF_4lQ8vkFR9ZzoGKNA9bPL1I"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Check chapters
print("Checking chapters data...")
response = supabase.table('chapters').select('id, story_id, chapter_number, title, r2_url').limit(10).execute()

print(f"\nFound {len(response.data)} chapters:")
for chapter in response.data:
    print(f"  Chapter {chapter['chapter_number']}: {chapter['title']}")
    print(f"    r2_url: {chapter['r2_url']}")
    print()

# Check if r2_url is null
null_count = sum(1 for c in response.data if not c['r2_url'])
print(f"\n⚠️ Chapters with null r2_url: {null_count}/{len(response.data)}")

if null_count > 0:
    print("\n❌ Problem: Chapters don't have r2_url!")
    print("Solution: Re-run scraper to populate r2_url field")
