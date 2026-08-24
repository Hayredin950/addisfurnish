export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_role_requests: {
        Row: {
          action: string;
          created_at: string;
          expires_at: string;
          id: string;
          requester_id: string;
          target_user_id: string;
          token: string;
          used_at: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          requester_id: string;
          target_user_id: string;
          token: string;
          used_at?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          requester_id?: string;
          target_user_id?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_role_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_role_requests_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_events: {
        Row: {
          id: string;
          event_name: string;
          user_id: string | null;
          listing_id: string | null;
          source: string | null;
          medium: string | null;
          campaign: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          user_id?: string | null;
          listing_id?: string | null;
          source?: string | null;
          medium?: string | null;
          campaign?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_name?: string;
          user_id?: string | null;
          listing_id?: string | null;
          source?: string | null;
          medium?: string | null;
          campaign?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      attribute_options: {
        Row: {
          attribute_id: string;
          id: string;
          is_active: boolean;
          label: string;
          label_am: string | null;
          sort_order: number;
          value: string;
        };
        Insert: {
          attribute_id: string;
          id?: string;
          is_active?: boolean;
          label: string;
          label_am?: string | null;
          sort_order?: number;
          value: string;
        };
        Update: {
          attribute_id?: string;
          id?: string;
          is_active?: boolean;
          label?: string;
          label_am?: string | null;
          sort_order?: number;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attribute_options_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "attributes";
            referencedColumns: ["id"];
          },
        ];
      };
      attributes: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_filterable: boolean;
          is_required: boolean;
          name: string;
          name_am: string | null;
          slug: string;
          sort_order: number;
          type: string;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_filterable?: boolean;
          is_required?: boolean;
          name: string;
          name_am?: string | null;
          slug: string;
          sort_order?: number;
          type: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_filterable?: boolean;
          is_required?: boolean;
          name?: string;
          name_am?: string | null;
          slug?: string;
          sort_order?: number;
          type?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
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
          description: string | null;
          icon: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          level: number;
          name: string;
          name_am: string | null;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          level?: number;
          name: string;
          name_am?: string | null;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          level?: number;
          name?: string;
          name_am?: string | null;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
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
      category_attributes: {
        Row: {
          attribute_id: string;
          category_id: string;
          id: string;
          is_filterable: boolean;
          is_required: boolean;
          sort_order: number;
        };
        Insert: {
          attribute_id: string;
          category_id: string;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: {
          attribute_id?: string;
          category_id?: string;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "category_attributes_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "attributes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_attributes_category_id_fkey";
            columns: ["category_id"];
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
      listing_attribute_values: {
        Row: {
          attribute_id: string;
          created_at: string;
          id: string;
          listing_id: string;
          option_id: string | null;
          value_boolean: boolean | null;
          value_number: number | null;
          value_text: string | null;
        };
        Insert: {
          attribute_id: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          option_id?: string | null;
          value_boolean?: boolean | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Update: {
          attribute_id?: string;
          created_at?: string;
          id?: string;
          listing_id?: string;
          option_id?: string | null;
          value_boolean?: boolean | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listing_attribute_values_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "attributes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_attribute_values_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_attribute_values_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "attribute_options";
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
          featured_until: string | null;
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
          video_url: string | null;
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
          video_url?: string | null;
          featured_until?: string | null;
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
          video_url?: string | null;
          featured_until?: string | null;
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
          image_url: string | null;
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
          image_url?: string | null;
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
          image_url?: string | null;
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
          is_super_admin: boolean;
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
          telegram_blocked: boolean;
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
          is_super_admin?: boolean;
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
          telegram_blocked?: boolean;
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
          is_super_admin?: boolean;
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
          telegram_blocked?: boolean;
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
      email_change_requests: {
        Row: {
          created_at: string;
          id: string;
          new_email: string;
          old_email: string | null;
          reason: string | null;
          rejection_reason: string | null;
          requested_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          new_email: string;
          old_email?: string | null;
          reason?: string | null;
          rejection_reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          new_email?: string;
          old_email?: string | null;
          reason?: string | null;
          rejection_reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_change_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          assigned_admin: string | null;
          created_at: string;
          details: string | null;
          id: string;
          resolution: string | null;
          listing_id: string | null;
          reason: string;
          reported_user_id: string | null;
          reporter_id: string;
          status: string;
        };
        Insert: {
          assigned_admin?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id?: string | null;
          reason: string;
          reported_user_id?: string | null;
          reporter_id: string;
          resolution?: string | null;
          status?: string;
        };
        Update: {
          assigned_admin?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          listing_id?: string | null;
          reason?: string;
          reported_user_id?: string | null;
          reporter_id?: string;
          resolution?: string | null;
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
      disputes: {
        Row: {
          id: string;
          listing_id: string | null;
          conversation_id: string | null;
          buyer_id: string;
          seller_id: string;
          opened_by: string | null;
          reason: string;
          description: string | null;
          status: string;
          deadline_at: string;
          resolution: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id?: string | null;
          conversation_id?: string | null;
          buyer_id: string;
          seller_id: string;
          opened_by?: string | null;
          reason: string;
          description?: string | null;
          status?: string;
          deadline_at?: string;
          resolution?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string | null;
          conversation_id?: string | null;
          buyer_id?: string;
          seller_id?: string;
          opened_by?: string | null;
          reason?: string;
          description?: string | null;
          status?: string;
          deadline_at?: string;
          resolution?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disputes_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          id: string;
          admin_user_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_value: unknown;
          new_value: unknown;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_user_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_value?: unknown;
          new_value?: unknown;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_value?: unknown;
          new_value?: unknown;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_user_id_fkey";
            columns: ["admin_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          value?: Json;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
      listing_view_milestones: {
        Row: {
          id: number;
          listing_id: string;
          reached_at: string;
          threshold: number;
        };
        Insert: {
          id?: number;
          listing_id: string;
          reached_at?: string;
          threshold: number;
        };
        Update: {
          id?: number;
          listing_id?: string;
          reached_at?: string;
          threshold?: number;
        };
        Relationships: [
          {
            foreignKeyName: "listing_view_milestones_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
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
      offers: {
        Row: {
          amount: number;
          buyer_id: string;
          created_at: string;
          id: string;
          listing_id: string;
          message: string | null;
          seller_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          buyer_id: string;
          created_at?: string;
          id?: string;
          listing_id: string;
          message?: string | null;
          seller_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          buyer_id?: string;
          created_at?: string;
          id?: string;
          listing_id?: string;
          message?: string | null;
          seller_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
      telegram_channel_posts: {
        Row: {
          listing_id: string;
          chat_id: string;
          message_id: number;
          posted_at: string;
        };
        Insert: {
          listing_id: string;
          chat_id: string;
          message_id: number;
          posted_at?: string;
        };
        Update: {
          listing_id?: string;
          chat_id?: string;
          message_id?: number;
          posted_at?: string;
        };
        Relationships: [];
      };
      telegram_chat_rate: {
        Row: {
          chat_id: string;
          last_sent_at: string;
        };
        Insert: {
          chat_id: string;
          last_sent_at?: string;
        };
        Update: {
          chat_id?: string;
          last_sent_at?: string;
        };
        Relationships: [];
      };
      telegram_delivery_log: {
        Row: {
          id: number;
          kind: string;
          chat_id: string | null;
          ok: boolean;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          kind: string;
          chat_id?: string | null;
          ok?: boolean;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          kind?: string;
          chat_id?: string | null;
          ok?: boolean;
          error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      telegram_processed_updates: {
        Row: {
          update_id: number;
          processed_at: string;
        };
        Insert: {
          update_id: number;
          processed_at?: string;
        };
        Update: {
          update_id?: number;
          processed_at?: string;
        };
        Relationships: [];
      };
      telegram_sell_sessions: {
        Row: {
          id: string;
          user_id: string;
          chat_id: string;
          step: string;
          photo_file_ids: string[];
          category_id: string | null;
          condition: string | null;
          price: number | null;
          city: string | null;
          listing_id: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chat_id: string;
          step?: string;
          photo_file_ids?: string[];
          category_id?: string | null;
          condition?: string | null;
          price?: number | null;
          city?: string | null;
          listing_id?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          chat_id?: string;
          step?: string;
          photo_file_ids?: string[];
          category_id?: string | null;
          condition?: string | null;
          price?: number | null;
          city?: string | null;
          listing_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      category_listing_counts: {
        Row: {
          category_id: string | null;
          category_slug: string | null;
          listing_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_pkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      admin_seller_performance: {
        Args: { _limit?: number };
        Returns: Json;
      };
      admin_health_stats: {
        Args: Record<string, never>;
        Returns: Json;
      };
      request_email_change: {
        Args: { _new_email: string; _reason?: string | null };
        Returns: Json;
      };
      admin_review_email_change: {
        Args: { _request_id: string; _approve: boolean; _reason?: string | null };
        Returns: Json;
      };
      admin_set_user_email: {
        Args: { _user_id: string; _new_email: string; _reason?: string | null };
        Returns: Json;
      };
      is_listing_owner: {
        Args: { _listing_id: string; _user_id: string };
        Returns: boolean;
      };
      admin_notify_user: {
        Args: {
          _user_id: string;
          _type: string;
          _payload?: Json;
        };
        Returns: undefined;
      };
      admin_get_profile_details: {
        Args: { _is_seller?: boolean | null };
        Returns: Json;
      };
      admin_request_role_change: {
        Args: { _target_user_id: string; _action: string };
        Returns: Json;
      };
      admin_confirm_role_change: {
        Args: { _code: string };
        Returns: Json;
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
      category_attribute_set: {
        Args: { _category_id: string };
        Returns: {
          attribute_id: string;
          slug: string;
          name: string;
          name_am: string | null;
          type: string;
          unit: string | null;
          is_required: boolean;
          is_filterable: boolean;
          sort_order: number;
          from_level: number;
        }[];
      };
      attribute_matching_listing_ids: {
        Args: { p_attrs?: Json; p_listing_ids?: string[] | null };
        Returns: {
          listing_id: string;
        }[];
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
