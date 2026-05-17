import os
import psycopg2
from dotenv import load_dotenv

def deploy():
    print("🚀 Starting Reader Hub Database Deployment...")
    
    # 1. Load environment variables
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("❌ Error: DATABASE_URL not found in .env file.")
        print("Please ensure your .env has: DATABASE_URL=postgres://postgres.[ID]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres")
        return

    # Fix potential direct connection issues if using transaction pooler
    # Some environments need sslmode=require
    if "sslmode=" not in db_url:
        if "?" in db_url:
            db_url += "&sslmode=require"
        else:
            db_url += "?sslmode=require"

    conn = None
    try:
        # 2. Connect to Supabase PostgreSQL
        print("🔗 Connecting to Supabase database...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()
        
        # 3. Read migration file
        migration_path = os.path.join("supabase", "migrations", "001_initial_schema.sql")
        if not os.path.exists(migration_path):
            print(f"❌ Error: Migration file not found at {migration_path}")
            return
            
        print(f"📖 Reading migration: {migration_path}")
        with open(migration_path, "r", encoding="utf-8") as f:
            sql = f.read()
            
        # 4. Execute SQL
        print("⚡ Executing SQL migration (this may take a few seconds)...")
        # We split by basic markers if needed, but psycopg2 can handle large blocks
        # However, some SQL commands like CREATE TRIGGER need to be handled carefully
        cur.execute(sql)
        
        print("✅ Database schema deployed successfully!")
        
        # 5. Verify tables
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
        tables = [row[0] for row in cur.fetchall()]
        print(f"📊 Current tables in 'public': {', '.join(tables)}")
        
        if 'stories' in tables and 'chapters' in tables:
            print("\n✨ DEPLOYMENT COMPLETE! Your Supabase backend is ready.")
        else:
            print("\n⚠️ Warning: Some tables might be missing. Please check Supabase Dashboard.")

    except Exception as e:
        print(f"❌ Deployment failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    deploy()
