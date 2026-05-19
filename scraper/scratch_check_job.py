import os
import sys
from dotenv import load_dotenv

# Load env variables from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.append(os.path.dirname(__file__))
from supabase_client import get_supabase_client

client = get_supabase_client()
res = client.table("scrape_jobs").select("*, stories(*)").eq("id", 19).execute()
print("JOB 22 DETAIL:")
if res.data:
    print(res.data[0])
else:
    print("Not found")

# Let's print the latest 5 jobs as well to understand what's going on!
print("\nLATEST 5 JOBS:")
res_latest = client.table("scrape_jobs").select("*, stories(*)").order("created_at", desc=True).limit(5).execute()
for job in res_latest.data:
    print(f"ID: {job['id']}, Status: {job['status']}, Start: {job['chapter_start']}, End: {job['chapter_end']}, Scraped: {job['chapters_scraped']}, Story Title: {job['stories']['title'] if job['stories'] else 'N/A'}")
