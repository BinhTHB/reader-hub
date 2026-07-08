export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string;
          id: number;
          story_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          story_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          story_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmarks_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chapters: {
        Row: {
          chapter_number: number;
          content: string | null;
          created_at: string;
          id: number;
          is_scraped: boolean;
          scraped_at: string | null;
          source_url: string | null;
          story_id: number;
          text_r2_url: string | null;
          title: string | null;
          word_count: number;
        };
        Insert: {
          chapter_number: number;
          content?: string | null;
          created_at?: string;
          id?: number;
          is_scraped?: boolean;
          scraped_at?: string | null;
          source_url?: string | null;
          story_id: number;
          text_r2_url?: string | null;
          title?: string | null;
          word_count?: number;
        };
        Update: {
          chapter_number?: number;
          content?: string | null;
          created_at?: string;
          id?: number;
          is_scraped?: boolean;
          scraped_at?: string | null;
          source_url?: string | null;
          story_id?: number;
          text_r2_url?: string | null;
          title?: string | null;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_admin: boolean;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_admin?: boolean;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_admin?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      reading_history: {
        Row: {
          created_at: string;
          id: number;
          last_chapter_number: number;
          last_read_at: string;
          scroll_position: number;
          story_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          last_chapter_number?: number;
          last_read_at?: string;
          scroll_position?: number;
          story_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          last_chapter_number?: number;
          last_read_at?: string;
          scroll_position?: number;
          story_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reading_history_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reading_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scrape_jobs: {
        Row: {
          chapter_end: number | null;
          chapter_start: number | null;
          chapters_scraped: number;
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          github_run_id: string | null;
          id: number;
          started_at: string | null;
          status: string;
          story_id: number | null;
        };
        Insert: {
          chapter_end?: number | null;
          chapter_start?: number | null;
          chapters_scraped?: number;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          github_run_id?: string | null;
          id?: number;
          started_at?: string | null;
          status?: string;
          story_id?: number | null;
        };
        Update: {
          chapter_end?: number | null;
          chapter_start?: number | null;
          chapters_scraped?: number;
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          github_run_id?: string | null;
          id?: number;
          started_at?: string | null;
          status?: string;
          story_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
        ];
      };
      stories: {
        Row: {
          author: string | null;
          cover_url: string | null;
          created_at: string;
          description: string | null;
          genres: string[] | null;
          id: number;
          is_featured: boolean;
          last_scraped_chapter: number;
          slug: string;
          source_name: string | null;
          source_url: string | null;
          status: string;
          title: string;
          total_chapters: number;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          author?: string | null;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          genres?: string[] | null;
          id?: number;
          is_featured?: boolean;
          last_scraped_chapter?: number;
          slug: string;
          source_name?: string | null;
          source_url?: string | null;
          status?: string;
          title: string;
          total_chapters?: number;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          author?: string | null;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          genres?: string[] | null;
          id?: number;
          is_featured?: boolean;
          last_scraped_chapter?: number;
          slug?: string;
          source_name?: string | null;
          source_url?: string | null;
          status?: string;
          title?: string;
          total_chapters?: number;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_view_count: {
        Args: { story_id_input: number };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
