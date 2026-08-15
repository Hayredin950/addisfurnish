export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      callback_requests: {
        Row: {
          buyer_id: string;
          created_at: string;
          id: string;
          listing_id: string;
          note: string | null;
          phone: string;
          seller_id: string;
          status: string;
        };
        Insert: {
          buyer_id: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          note?: string | null;
          phone: string;
          seller_id: string;
          status?: string;
        };
        Update: {
          buyer_id?: string;
          created_at?: string;
          id?: string;
          listing_id?: string;
          note?: string | null;
          phone?: string;
          seller_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "callback_requests_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          icon: string | null;
          id: string;
          name: string;
          name_am: string | null;
          parent_id: string | null;
          slug: string;
          sort_order: number;
        };
        Insert: {
          icon?: string | null;
          id?: string;
          name: string;
          name_am?: string | null;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
        };
        Update: {
          icon?: string | null;
          id?: string;
          name?: string;
          name_am?: string | null;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          buyer_deleted_at: string | null;
          buyer_id: string;
          created_at: string;
          id: string;
          last_message_at: string;
          listing_id: string;
          seller_deleted_at: string | null;
          seller_id: string;
        };
        Insert: {
          buyer_deleted_at?: string | null;
          buyer_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          listing_id: string;
          seller_deleted_at?: string | null;
          seller_id: string;
        };
        Update: {
          buyer_deleted_at?: string | null;
          buyer_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          listing_id?: string;
          seller_deleted_at?: string | null;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          position: number;
          url: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          position?: number;
          url: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          position?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          brand: string | null;
          category_id: string | null;
          city: string;
          color: string | null;
          condition: string;
          created_at: string;
          delivery_fee: number | null;
          delivery_offered: boolean;
          description: string;
          discount_expires_at: string | null;
          featured: boolean;
          id: string;
          latitude: number | null;
          longitude: number | null;
          material: string | null;
          negotiable: boolean;
          original_price: number | null;
          price: number;
          room_type: string | null;
          seller_id: string;
          status: string;
          sub_city: string | null;
          telegram_posted_at: string | null;
          title: string;
          updated_at: string;
          view_count: number;
        };
        Insert: {
          brand?: string | null;
          category_id?: string | null;
          city?: string;
          color?: string | null;
          condition?: string;
          created_at?: string;
          delivery_fee?: number | null;
          delivery_offered?: boolean;
          description?: string;
          discount_expires_at?: string | null;
          featured?: boolean;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          material?: string | null;
          negotiable?: boolean;
          original_price?: number | null;
          price: number;
          room_type?: string | null;
          seller_id: string;
          status?: string;
          sub_city?: string | null;
          telegram_posted_at?: string | null;
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Update: {
          brand?: string | null;
          category_id?: string | null;
          city?: string;
          color?: string | null;
          condition?: string;
          created_at?: string;
          delivery_fee?: number | null;
          delivery_offered?: boolean;
          description?: string;
          discount_expires_at?: string | null;
          featured?: boolean;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          material?: string | null;
          negotiable?: boolean;
          original_price?: number | null;
          price?: number;
          room_type?: string | null;
          seller_id?: string;
          status?: string;
          sub_city?: string | null;
          telegram_posted_at?: string | null;
          title?: string;
          updated_at?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          read_at: string | null;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      price_history: {
        Row: {
          changed_at: string;
          id: string;
          listing_id: string;
          price: number;
        };
        Insert: {
          changed_at?: string;
          id?: string;
          listing_id: string;
          price: number;
        };
        Update: {
          changed_at?: string;
          id?: string;
          listing_id?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "price_history_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          banned_until: string | null;
          ban_reason: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          full_name: string;
          id: string;
          is_online: boolean;
          is_seller: boolean;
          last_seen: string;
          latitude: number | null;
          longitude: number | null;
          phone: string | null;
          phone_verified_at: string | null;
          preferred_language: string;
          registration_number: string | null;
          shop_address: string | null;
          shop_description: string | null;
          shop_logo_url: string | null;
          shop_name: string | null;
          shop_slug: string | null;
          telegram: string | null;
          telegram_chat_id: string | null;
          telegram_channel_joined_at: string | null;
          telegram_link_token: string | null;
          telegram_link_token_expires_at: string | null;
          phone_verify_token: string | null;
          phone_verify_token_expires_at: string | null;
          phone_verify_phone: string | null;
          phone_verify_chat_id: string | null;
          telegram_linked_at: string | null;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          banned_until?: string | null;
          ban_reason?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          is_online?: boolean;
          is_seller?: boolean;
          last_seen?: string;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferred_language?: string;
          registration_number?: string | null;
          shop_address?: string | null;
          shop_description?: string | null;
          shop_logo_url?: string | null;
          shop_name?: string | null;
          shop_slug?: string | null;
          telegram?: string | null;
          telegram_chat_id?: string | null;
          telegram_channel_joined_at?: string | null;
          telegram_link_token?: string | null;
          telegram_link_token_expires_at?: string | null;
          phone_verify_token?: string | null;
          phone_verify_token_expires_at?: string | null;
          phone_verify_phone?: string | null;
          phone_verify_chat_id?: string | null;
          telegram_linked_at?: string | null;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          banned_until?: string | null;
          ban_reason?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          is_online?: boolean;
          is_seller?: boolean;
          last_seen?: string;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferred_language?: string;
          registration_number?: string | null;
          shop_address?: string | null;
          shop_description?: string | null;
          shop_logo_url?: string | null;
          shop_name?: string | null;
          shop_slug?: string | null;
          telegram?: string | null;
          telegram_chat_id?: string | null;
          telegram_channel_joined_at?: string | null;
          telegram_link_token?: string | null;
          telegram_link_token_expires_at?: string | null;
          phone_verify_token?: string | null;
          phone_verify_token_expires_at?: string | null;
          phone_verify_phone?: string | null;
          phone_verify_chat_id?: string | null;
          telegram_linked_at?: string | null;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          author_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          rating: number;
          seller_id: string;
        };
        Insert: {
          author_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating: number;
          seller_id: string;
        };
        Update: {
          author_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating?: number;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          listing_id: string | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id?: string | null;
          reason: string;
          reported_user_id?: string | null;
          reporter_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id?: string | null;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey";
            columns: ["reported_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      buyer_preferences: {
        Row: {
          category_ids: string[];
          price_max: number | null;
          price_min: number | null;
          preferred_cities: string[];
          telegram_alerts_enabled: boolean;
          user_id: string;
        };
        Insert: {
          category_ids?: string[];
          price_max?: number | null;
          price_min?: number | null;
          preferred_cities?: string[];
          telegram_alerts_enabled?: boolean;
          user_id: string;
        };
        Update: {
          category_ids?: string[];
          price_max?: number | null;
          price_min?: number | null;
          preferred_cities?: string[];
          telegram_alerts_enabled?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      listing_views: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listing_views_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          created_at: string;
          filters: Json;
          id: string;
          query: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: Json;
          id?: string;
          query?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          id?: string;
          query?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          is_read: boolean;
          payload: Json;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          payload?: Json;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          payload?: Json;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform?: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recently_viewed: {
        Row: {
          listing_id: string;
          user_id: string;
          viewed_at: string;
        };
        Insert: {
          listing_id: string;
          user_id: string;
          viewed_at?: string;
        };
        Update: {
          listing_id?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recently_viewed_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      search_log: {
        Row: {
          created_at: string;
          id: string;
          query: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          query: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          query?: string;
        };
        Relationships: [];
      };
      phone_otps: {
        Row: {
          attempts: number;
          code: string;
          created_at: string;
          expires_at: string;
          id: string;
          ip_address: string | null;
          phone: string;
          purpose: string;
          user_id: string | null;
        };
        Insert: {
          attempts?: number;
          code: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          ip_address?: string | null;
          phone: string;
          purpose?: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          code?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          ip_address?: string | null;
          phone?: string;
          purpose?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      seller_verification_documents: {
        Row: {
          created_at: string;
          document_type: string;
          file_url: string;
          id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          seller_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          document_type: string;
          file_url: string;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seller_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          document_type?: string;
          file_url?: string;
          id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seller_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_verification_documents_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      verification_decisions: {
        Row: {
          action: string;
          created_at: string;
          document_id: string | null;
          id: string;
          reason: string | null;
          reviewer_id: string;
          seller_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          document_id?: string | null;
          id?: string;
          reason?: string | null;
          reviewer_id: string;
          seller_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          document_id?: string | null;
          id?: string;
          reason?: string | null;
          reviewer_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verification_decisions_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verification_decisions_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_notify_user: {
        Args: {
          _user_id: string;
          _type: string;
          _payload?: Json;
        };
        Returns: undefined;
      };
      admin_revoke_sessions: {
        Args: { _user_id: string };
        Returns: undefined;
      };
      admin_set_ban: {
        Args: { _user_id: string; _until: string | null; _reason?: string | null };
        Returns: undefined;
      };
      claim_push_token: {
        Args: { _token: string; _platform: string };
        Returns: undefined;
      };
      mint_telegram_link_token: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      mint_phone_verify_token: {
        Args: { _phone: string };
        Returns: string | null;
      };
      verify_phone_otp: {
        Args: { _phone: string; _code: string };
        Returns: string;
      };
      unlink_telegram: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      record_listing_view: {
        Args: { _listing_id: string };
        Returns: undefined;
      };
      notify_user: {
        Args: {
          _user_id: string;
          _type: string;
          _payload?: Json;
        };
        Returns: undefined;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      increment_listing_views: {
        Args: { _listing_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "moderator" | "user";
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
