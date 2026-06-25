"""
R2 Uploader — Upload chapter content to Cloudflare R2 (Scrapling branch)

Uses boto3 (S3-compatible API) to store JSON content files
and cover images in Cloudflare R2.
"""

import json
import os
import boto3
from botocore.config import Config


def get_r2_client():
    """Create and return an S3-compatible client configured for Cloudflare R2."""
    account_id = os.environ["CF_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(
            retries={"max_attempts": 3, "mode": "adaptive"},
            s3={"addressing_style": "path"},
        ),
    )


def get_public_url(key: str) -> str:
    """Generate the public URL for a given R2 object key."""
    domain = os.environ["R2_PUBLIC_DOMAIN"]
    return f"https://{domain}/{key}"


def upload_chapter(
    story_slug: str,
    chapter_number: int,
    title: str,
    paragraphs: list[str],
    word_count: int,
) -> str:
    """
    Upload chapter content as a JSON file to R2.

    Args:
        story_slug: URL-friendly story identifier
        chapter_number: Chapter number
        title: Chapter title
        paragraphs: List of paragraph strings (cleaned text)
        word_count: Total word count of the chapter

    Returns:
        Public URL of the uploaded file
    """
    from datetime import datetime, timezone

    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")

    key = f"stories/{story_slug}/chapters/{chapter_number}.json"

    data = {
        "story_slug": story_slug,
        "chapter_number": chapter_number,
        "title": title,
        "paragraphs": paragraphs,
        "word_count": word_count,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    body = json.dumps(data, ensure_ascii=False, indent=None)

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=86400",  # 24h cache
    )

    print(f"  ✅ Uploaded: {key} ({len(body)} bytes)")
    return get_public_url(key)


def upload_cover(story_slug: str, image_data: bytes, content_type: str = "image/webp") -> str:
    """
    Upload cover image to R2.

    Args:
        story_slug: URL-friendly story identifier
        image_data: Raw image bytes
        content_type: MIME type of the image

    Returns:
        Public URL of the uploaded cover image
    """
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")

    ext = content_type.split("/")[-1]
    key = f"stories/{story_slug}/cover.{ext}"

    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=image_data,
        ContentType=content_type,
        CacheControl="public, max-age=604800",  # 7 days cache
    )

    print(f"  ✅ Uploaded cover: {key}")
    return get_public_url(key)


def check_chapter_exists(story_slug: str, chapter_number: int) -> bool:
    """Check if a chapter file already exists in R2."""
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")
    key = f"stories/{story_slug}/chapters/{chapter_number}.json"

    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except client.exceptions.ClientError:
        return False


def get_existing_chapters(story_slug: str) -> set[int]:
    """Get all existing chapter numbers for a story in R2 using a single list request."""
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")
    prefix = f"stories/{story_slug}/chapters/"
    
    existing = set()
    try:
        paginator = client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    filename = key.split('/')[-1]
                    if filename.endswith('.json'):
                        try:
                            ch_num = int(filename.split('.')[0])
                            existing.add(ch_num)
                        except ValueError:
                            pass
    except Exception as e:
        print(f"  ⚠️ Error listing existing chapters from R2: {e}")
        
    return existing


def get_chapter_metadata(story_slug: str, chapter_number: int) -> dict | None:
    """Read existing chapter JSON metadata from R2 for stale-content checks."""
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME", "reader-hub-data")
    key = f"stories/{story_slug}/chapters/{chapter_number}.json"

    try:
        obj = client.get_object(Bucket=bucket, Key=key)
        raw = obj["Body"].read().decode("utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            return {
                "title": data.get("title"),
                "word_count": data.get("word_count"),
                "paragraph_count": len(data.get("paragraphs") or []),
                "source_url": data.get("source_url"),
            }
    except client.exceptions.ClientError:
        return None
    except Exception as e:
        print(f"  ⚠️ Error reading existing chapter metadata from R2: {e}")
    return None

