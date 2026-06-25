"""
One-time script: backfill source_url from Supabase into existing R2 chapter JSONs.

Reads chapters from Supabase (story_id=17, Pháp Sư Chi Thượng),
fetches each existing R2 JSON, patches in source_url if missing,
and re-uploads. Dry-run by default.

Usage:
    uv run python scrapling/backfill_source_url.py              # dry-run
    uv run python scrapling/backfill_source_url.py --apply      # actually write
"""

import json
import os
import sys

# Project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import boto3
from botocore.config import Config

from scrapling.supabase_client import _rest

STORY_ID = 17
SLUG = "phap-su-chi-thuong"
DRY_RUN = "--apply" not in sys.argv


def get_r2_client():
    account_id = os.environ["CF_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(retries={"max_attempts": 3, "mode": "adaptive"},
                       s3={"addressing_style": "path"}),
    )


def main():
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")

    # Fetch all chapters with source_url from Supabase
    print(f"📡 Fetching chapters for story_id={STORY_ID} from Supabase...")
    params = (
        f"?story_id=eq.{STORY_ID}"
        f"&select=chapter_number,source_url"
        f"&order=chapter_number.asc"
    )
    chapters = _rest("GET", "chapters", params=params)
    if not isinstance(chapters, list):
        print(f"❌ Unexpected response: {chapters}")
        sys.exit(1)

    total = len(chapters)
    print(f"   Got {total} chapters.\n")

    skipped = 0
    missing_src = 0
    patched = 0
    errors = 0

    for i, ch in enumerate(chapters, 1):
        ch_num = ch.get("chapter_number")
        source_url = ch.get("source_url")

        if not source_url:
            print(f"  [{i:>4}/{total}] Ch {ch_num}: ⏭️ no source_url in Supabase, skipping")
            missing_src += 1
            continue

        key = f"stories/{SLUG}/chapters/{ch_num}.json"

        try:
            obj = client.get_object(Bucket=bucket, Key=key)
            raw = obj["Body"].read().decode("utf-8")
            data = json.loads(raw)
        except client.exceptions.ClientError:
            print(f"  [{i:>4}/{total}] Ch {ch_num}: ⏭️ no R2 file, skipping")
            skipped += 1
            continue
        except Exception as e:
            print(f"  [{i:>4}/{total}] Ch {ch_num}: ❌ read error: {e}")
            errors += 1
            continue

        existing_url = data.get("source_url")
        if existing_url:
            if existing_url == source_url:
                print(f"  [{i:>4}/{total}] Ch {ch_num}: ✅ already has matching source_url")
            else:
                print(f"  [{i:>4}/{total}] Ch {ch_num}: ⚠️ existing source_url differs:\n"
                      f"          existing: {existing_url}\n"
                      f"          supabase: {source_url}")
            skipped += 1
            continue

        # Patch
        data["source_url"] = source_url
        body = json.dumps(data, ensure_ascii=False, indent=None)

        if DRY_RUN:
            print(f"  [{i:>4}/{total}] Ch {ch_num}: 🔍 would patch source_url (dry-run)")
        else:
            client.put_object(
                Bucket=bucket,
                Key=key,
                Body=body.encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
            print(f"  [{i:>4}/{total}] Ch {ch_num}: ✅ patched source_url ({len(body)} bytes)")
        patched += 1

    print(f"\n{'='*50}")
    print(f"Done. Total: {total} | Patched: {patched} | Already ok: {skipped}")
    print(f"No source_url in Supabase: {missing_src} | Errors: {errors}")
    if DRY_RUN:
        print(f"\n🔍 Dry-run mode – no files written. Re-run with --apply to actually write.")
    else:
        print(f"\n✅ Apply mode – files updated.")


if __name__ == "__main__":
    main()
