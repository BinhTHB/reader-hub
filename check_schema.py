import os
from supabase import create_client

# Load credentials
SUPABASE_URL = "https://gvxzdhufnqhicsgawlyz.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eHpkaHVmbnFoaWNzZ2F3bHl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNzI2OCwiZXhwIjoyMDk0MjgzMjY4fQ.kXp19H1Fkueg4STBu1xF_4lQ8vkFR9ZzoGKNA9bPL1I"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Check chapters schema
print("Checking chapters table schema...")
response = supabase.table('chapters').select('*').limit(1).execute()

if response.data:
    print("\nColumns in chapters table:")
    for key in response.data[0].keys():
        print(f"  - {key}")
    
    print("\n\nSample chapter data:")
    print(response.data[0])
else:
    print("No chapters found in database")
