export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          staff_id: string;
          title: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          staff_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          staff_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_conversations_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          content: NonNullable<Json>;
          conversation_id: string;
          created_at: string;
          id: number;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          content: NonNullable<Json>;
          conversation_id: string;
          created_at?: string;
          id?: never;
          role: string;
        };
        Update: {
          content?: NonNullable<Json>;
          conversation_id?: string;
          created_at?: string;
          id?: never;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage_log: {
        Row: {
          count_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          feature: Database["public"]["Enums"]["ai_feature"];
          id: number;
          input_tokens: number | null;
          model: string;
          output_tokens: number | null;
          raw_response: Json | null;
          staff_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          count_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          feature: Database["public"]["Enums"]["ai_feature"];
          id?: never;
          input_tokens?: number | null;
          model: string;
          output_tokens?: number | null;
          raw_response?: Json | null;
          staff_id?: string | null;
        };
        Update: {
          count_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          feature?: Database["public"]["Enums"]["ai_feature"];
          id?: never;
          input_tokens?: number | null;
          model?: string;
          output_tokens?: number | null;
          raw_response?: Json | null;
          staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "stock_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_log_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_consumption";
            referencedColumns: ["count_id"];
          },
          {
            foreignKeyName: "ai_usage_log_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_list";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_log_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_slots_today";
            referencedColumns: ["count_id"];
          },
          {
            foreignKeyName: "ai_usage_log_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_log_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          branch_shelf_life_days: number;
          branch_transfers_enabled: boolean;
          count_late_after_minutes: number;
          count_reminder_minutes_before: number;
          default_pieces_per_cake: number;
          factory_shelf_life_days: number;
          id: boolean;
          order_approval_required: boolean;
          photo_count_enabled: boolean;
          returns_enabled: boolean;
          unreceived_alert_hours: number;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          branch_shelf_life_days?: number;
          branch_transfers_enabled?: boolean;
          count_late_after_minutes?: number;
          count_reminder_minutes_before?: number;
          default_pieces_per_cake?: number;
          factory_shelf_life_days?: number;
          id?: boolean;
          order_approval_required?: boolean;
          photo_count_enabled?: boolean;
          returns_enabled?: boolean;
          unreceived_alert_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          branch_shelf_life_days?: number;
          branch_transfers_enabled?: boolean;
          count_late_after_minutes?: number;
          count_reminder_minutes_before?: number;
          default_pieces_per_cake?: number;
          factory_shelf_life_days?: number;
          id?: boolean;
          order_approval_required?: boolean;
          photo_count_enabled?: boolean;
          returns_enabled?: boolean;
          unreceived_alert_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          changed_at: string;
          changed_by: string | null;
          id: number;
          new_values: Json | null;
          old_values: Json | null;
          reason: string | null;
          row_id: string;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          row_id: string;
          table_name: string;
        };
        Update: {
          action?: string;
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_values?: Json | null;
          old_values?: Json | null;
          reason?: string | null;
          row_id?: string;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      batches: {
        Row: {
          created_at: string;
          day_number: number | null;
          id: string;
          product_id: string;
          production_date: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_number?: never;
          id?: string;
          product_id: string;
          production_date: string;
        };
        Update: {
          created_at?: string;
          day_number?: never;
          id?: string;
          product_id?: string;
          production_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      count_form_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          location_id: string;
          product_ids: string[];
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location_id: string;
          product_ids: string[];
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location_id?: string;
          product_ids?: string[];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "count_form_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "count_form_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "count_form_versions_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      count_schedules: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          location_id: string;
          time_of_day: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_id: string;
          time_of_day: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_id?: string;
          time_of_day?: string;
        };
        Relationships: [
          {
            foreignKeyName: "count_schedules_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatch_line_batches: {
        Row: {
          batch_id: string;
          dispatch_line_id: string;
          id: string;
          is_fefo_override: boolean;
          override_confirmed_by: string | null;
          qty_pieces: number;
        };
        ComputedFields: never;
        Insert: {
          batch_id: string;
          dispatch_line_id: string;
          id?: string;
          is_fefo_override?: boolean;
          override_confirmed_by?: string | null;
          qty_pieces: number;
        };
        Update: {
          batch_id?: string;
          dispatch_line_id?: string;
          id?: string;
          is_fefo_override?: boolean;
          override_confirmed_by?: string | null;
          qty_pieces?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_line_batches_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_line_batches_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "dispatch_line_batches_dispatch_line_id_fkey";
            columns: ["dispatch_line_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_line_batches_override_confirmed_by_fkey";
            columns: ["override_confirmed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_line_batches_override_confirmed_by_fkey";
            columns: ["override_confirmed_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatch_lines: {
        Row: {
          dispatch_id: string;
          id: string;
          loose_pieces: number;
          pieces_per_cake_snapshot: number | null;
          product_id: string;
          qty_pieces: number | null;
          request_line_id: string | null;
          whole_cakes: number;
        };
        ComputedFields: never;
        Insert: {
          dispatch_id: string;
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id: string;
          qty_pieces?: never;
          request_line_id?: string | null;
          whole_cakes?: number;
        };
        Update: {
          dispatch_id?: string;
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id?: string;
          qty_pieces?: never;
          request_line_id?: string | null;
          whole_cakes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dispatch_lines_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_lines_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "v_unreceived_dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatch_lines_request_line_id_fkey";
            columns: ["request_line_id"];
            isOneToOne: false;
            referencedRelation: "stock_request_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      dispatches: {
        Row: {
          dispatched_at: string;
          dispatched_by: string;
          driver_name: string | null;
          from_location_id: string;
          id: string;
          kind: Database["public"]["Enums"]["dispatch_kind"];
          note: string | null;
          request_id: string | null;
          status: Database["public"]["Enums"]["dispatch_status"];
          to_location_id: string;
        };
        ComputedFields: never;
        Insert: {
          dispatched_at?: string;
          dispatched_by: string;
          driver_name?: string | null;
          from_location_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["dispatch_kind"];
          note?: string | null;
          request_id?: string | null;
          status?: Database["public"]["Enums"]["dispatch_status"];
          to_location_id: string;
        };
        Update: {
          dispatched_at?: string;
          dispatched_by?: string;
          driver_name?: string | null;
          from_location_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["dispatch_kind"];
          note?: string | null;
          request_id?: string | null;
          status?: Database["public"]["Enums"]["dispatch_status"];
          to_location_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dispatches_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "stock_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          kind: Database["public"]["Enums"]["location_kind"];
          name: string;
          parent_location_id: string | null;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind: Database["public"]["Enums"]["location_kind"];
          name: string;
          parent_location_id?: string | null;
          sort_order?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          kind?: Database["public"]["Enums"]["location_kind"];
          name?: string;
          parent_location_id?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "locations_parent_location_id_fkey";
            columns: ["parent_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          attempted_at: string;
          id: number;
          ip: unknown;
          phone: string;
          succeeded: boolean;
        };
        ComputedFields: never;
        Insert: {
          attempted_at?: string;
          id?: never;
          ip?: unknown;
          phone: string;
          succeeded: boolean;
        };
        Update: {
          attempted_at?: string;
          id?: never;
          ip?: unknown;
          phone?: string;
          succeeded?: boolean;
        };
        Relationships: [];
      };
      notification_log: {
        Row: {
          dispatch_id: string | null;
          id: number;
          kind: Database["public"]["Enums"]["notification_kind"];
          location_id: string | null;
          recipients: number;
          schedule_id: string | null;
          sent_at: string;
          slot_date: string | null;
        };
        ComputedFields: never;
        Insert: {
          dispatch_id?: string | null;
          id?: never;
          kind: Database["public"]["Enums"]["notification_kind"];
          location_id?: string | null;
          recipients?: number;
          schedule_id?: string | null;
          sent_at?: string;
          slot_date?: string | null;
        };
        Update: {
          dispatch_id?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["notification_kind"];
          location_id?: string | null;
          recipients?: number;
          schedule_id?: string | null;
          sent_at?: string;
          slot_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: false;
            referencedRelation: "v_unreceived_dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "count_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "v_count_slots_today";
            referencedColumns: ["schedule_id"];
          },
        ];
      };
      par_levels: {
        Row: {
          location_id: string;
          par_pieces: number;
          product_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          location_id: string;
          par_pieces: number;
          product_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          location_id?: string;
          par_pieces?: number;
          product_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "par_levels_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "par_levels_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "par_levels_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "par_levels_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "par_levels_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      production_entries: {
        Row: {
          id: string;
          location_id: string;
          note: string | null;
          production_date: string;
          recorded_at: string;
          recorded_by: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          location_id: string;
          note?: string | null;
          production_date?: string;
          recorded_at?: string;
          recorded_by: string;
        };
        Update: {
          id?: string;
          location_id?: string;
          note?: string | null;
          production_date?: string;
          recorded_at?: string;
          recorded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "production_entries_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_entries_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_entries_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      production_lines: {
        Row: {
          batch_id: string;
          entry_id: string;
          id: string;
          loose_pieces: number;
          pieces_per_cake_snapshot: number | null;
          product_id: string;
          qty_pieces: number | null;
          whole_cakes: number;
        };
        ComputedFields: never;
        Insert: {
          batch_id: string;
          entry_id: string;
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id: string;
          qty_pieces?: never;
          whole_cakes?: number;
        };
        Update: {
          batch_id?: string;
          entry_id?: string;
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id?: string;
          qty_pieces?: never;
          whole_cakes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "production_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "production_lines_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "production_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          created_at: string;
          id: string;
          image_path: string | null;
          is_active: boolean;
          name_ar: string | null;
          name_en: string;
          pieces_per_cake: number | null;
          sell_mode: Database["public"]["Enums"]["sell_mode"];
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          name_ar?: string | null;
          name_en: string;
          pieces_per_cake?: number | null;
          sell_mode?: Database["public"]["Enums"]["sell_mode"];
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_path?: string | null;
          is_active?: boolean;
          name_ar?: string | null;
          name_en?: string;
          pieces_per_cake?: number | null;
          sell_mode?: Database["public"]["Enums"]["sell_mode"];
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth_key: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_used_at: string | null;
          p256dh: string;
          staff_id: string;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          auth_key: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_used_at?: string | null;
          p256dh: string;
          staff_id: string;
          user_agent?: string | null;
        };
        Update: {
          auth_key?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_used_at?: string | null;
          p256dh?: string;
          staff_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      raw_count_lines: {
        Row: {
          count_id: string;
          entered_qty: number;
          entered_unit_id: string | null;
          id: string;
          material_id: string;
          qty_base: number;
        };
        ComputedFields: never;
        Insert: {
          count_id: string;
          entered_qty: number;
          entered_unit_id?: string | null;
          id?: string;
          material_id: string;
          qty_base: number;
        };
        Update: {
          count_id?: string;
          entered_qty?: number;
          entered_unit_id?: string | null;
          id?: string;
          material_id?: string;
          qty_base?: number;
        };
        Relationships: [
          {
            foreignKeyName: "raw_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "raw_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_count_lines_entered_unit_id_fkey";
            columns: ["entered_unit_id"];
            isOneToOne: false;
            referencedRelation: "raw_material_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_count_lines_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "raw_materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_count_lines_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "v_raw_stock";
            referencedColumns: ["material_id"];
          },
        ];
      };
      raw_counts: {
        Row: {
          business_date: string;
          confirmed_at: string | null;
          counted_by: string;
          created_at: string;
          id: string;
          location_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["count_status"];
        };
        ComputedFields: never;
        Insert: {
          business_date?: string;
          confirmed_at?: string | null;
          counted_by: string;
          created_at?: string;
          id?: string;
          location_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["count_status"];
        };
        Update: {
          business_date?: string;
          confirmed_at?: string | null;
          counted_by?: string;
          created_at?: string;
          id?: string;
          location_id?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["count_status"];
        };
        Relationships: [
          {
            foreignKeyName: "raw_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_counts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      raw_material_units: {
        Row: {
          factor_to_base: number;
          id: string;
          material_id: string;
          unit_name: string;
        };
        ComputedFields: never;
        Insert: {
          factor_to_base: number;
          id?: string;
          material_id: string;
          unit_name: string;
        };
        Update: {
          factor_to_base?: number;
          id?: string;
          material_id?: string;
          unit_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "raw_material_units_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "raw_materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_material_units_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "v_raw_stock";
            referencedColumns: ["material_id"];
          },
        ];
      };
      raw_materials: {
        Row: {
          base_unit: string;
          code: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          min_qty: number;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          base_unit: string;
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          min_qty?: number;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          base_unit?: string;
          code?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          min_qty?: number;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      raw_movements: {
        Row: {
          correction_audit_id: number | null;
          created_by: string | null;
          entered_qty: number | null;
          entered_unit_id: string | null;
          id: number;
          invoice_photo_path: string | null;
          location_id: string;
          material_id: string;
          movement_type: Database["public"]["Enums"]["raw_movement_type"];
          occurred_at: string;
          qty_base: number;
          raw_count_line_id: string | null;
          recorded_at: string;
          supplier_name: string | null;
        };
        ComputedFields: never;
        Insert: {
          correction_audit_id?: number | null;
          created_by?: string | null;
          entered_qty?: number | null;
          entered_unit_id?: string | null;
          id?: never;
          invoice_photo_path?: string | null;
          location_id: string;
          material_id: string;
          movement_type: Database["public"]["Enums"]["raw_movement_type"];
          occurred_at: string;
          qty_base: number;
          raw_count_line_id?: string | null;
          recorded_at?: string;
          supplier_name?: string | null;
        };
        Update: {
          correction_audit_id?: number | null;
          created_by?: string | null;
          entered_qty?: number | null;
          entered_unit_id?: string | null;
          id?: never;
          invoice_photo_path?: string | null;
          location_id?: string;
          material_id?: string;
          movement_type?: Database["public"]["Enums"]["raw_movement_type"];
          occurred_at?: string;
          qty_base?: number;
          raw_count_line_id?: string | null;
          recorded_at?: string;
          supplier_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "raw_movements_correction_audit_id_fkey";
            columns: ["correction_audit_id"];
            isOneToOne: false;
            referencedRelation: "audit_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_entered_unit_id_fkey";
            columns: ["entered_unit_id"];
            isOneToOne: false;
            referencedRelation: "raw_material_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "raw_materials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_movements_material_id_fkey";
            columns: ["material_id"];
            isOneToOne: false;
            referencedRelation: "v_raw_stock";
            referencedColumns: ["material_id"];
          },
          {
            foreignKeyName: "raw_movements_raw_count_line_id_fkey";
            columns: ["raw_count_line_id"];
            isOneToOne: false;
            referencedRelation: "raw_count_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      receipt_lines: {
        Row: {
          damage_waste_id: string | null;
          damaged_pieces: number;
          dispatch_line_id: string;
          id: string;
          loose_pieces: number;
          note: string | null;
          pieces_per_cake_snapshot: number | null;
          qty_pieces: number | null;
          receipt_id: string;
          resolution: Database["public"]["Enums"]["discrepancy_resolution"] | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          whole_cakes: number;
        };
        ComputedFields: never;
        Insert: {
          damage_waste_id?: string | null;
          damaged_pieces?: number;
          dispatch_line_id: string;
          id?: string;
          loose_pieces?: number;
          note?: string | null;
          pieces_per_cake_snapshot?: number | null;
          qty_pieces?: never;
          receipt_id: string;
          resolution?: Database["public"]["Enums"]["discrepancy_resolution"] | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          whole_cakes?: number;
        };
        Update: {
          damage_waste_id?: string | null;
          damaged_pieces?: number;
          dispatch_line_id?: string;
          id?: string;
          loose_pieces?: number;
          note?: string | null;
          pieces_per_cake_snapshot?: number | null;
          qty_pieces?: never;
          receipt_id?: string;
          resolution?: Database["public"]["Enums"]["discrepancy_resolution"] | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          whole_cakes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "receipt_lines_damage_waste_id_fkey";
            columns: ["damage_waste_id"];
            isOneToOne: false;
            referencedRelation: "waste_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_lines_dispatch_line_id_fkey";
            columns: ["dispatch_line_id"];
            isOneToOne: true;
            referencedRelation: "dispatch_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_lines_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_lines_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipt_lines_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: {
          dispatch_id: string;
          id: string;
          location_id: string;
          received_at: string;
          received_by: string;
        };
        ComputedFields: never;
        Insert: {
          dispatch_id: string;
          id?: string;
          location_id: string;
          received_at?: string;
          received_by: string;
        };
        Update: {
          dispatch_id?: string;
          id?: string;
          location_id?: string;
          received_at?: string;
          received_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: true;
            referencedRelation: "dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_dispatch_id_fkey";
            columns: ["dispatch_id"];
            isOneToOne: true;
            referencedRelation: "v_unreceived_dispatches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "receipts_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      return_dispositions: {
        Row: {
          decided_at: string;
          decided_by: string;
          id: string;
          receipt_line_id: string;
          to_stock_batch_id: string | null;
          to_stock_pieces: number;
          to_waste_pieces: number;
          waste_record_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          decided_at?: string;
          decided_by: string;
          id?: string;
          receipt_line_id: string;
          to_stock_batch_id?: string | null;
          to_stock_pieces?: number;
          to_waste_pieces?: number;
          waste_record_id?: string | null;
        };
        Update: {
          decided_at?: string;
          decided_by?: string;
          id?: string;
          receipt_line_id?: string;
          to_stock_batch_id?: string | null;
          to_stock_pieces?: number;
          to_waste_pieces?: number;
          waste_record_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "return_dispositions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_dispositions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_dispositions_receipt_line_id_fkey";
            columns: ["receipt_line_id"];
            isOneToOne: false;
            referencedRelation: "receipt_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_dispositions_to_stock_batch_id_fkey";
            columns: ["to_stock_batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_dispositions_to_stock_batch_id_fkey";
            columns: ["to_stock_batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "return_dispositions_waste_record_id_fkey";
            columns: ["waste_record_id"];
            isOneToOne: false;
            referencedRelation: "waste_records";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          created_at: string;
          created_by: string | null;
          failed_pin_attempts: number;
          full_name: string;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          location_id: string | null;
          locked_until: string | null;
          phone: string;
          requires_admin_reset: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          failed_pin_attempts?: number;
          full_name: string;
          id: string;
          is_active?: boolean;
          last_login_at?: string | null;
          location_id?: string | null;
          locked_until?: string | null;
          phone: string;
          requires_admin_reset?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          failed_pin_attempts?: number;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          location_id?: string | null;
          locked_until?: string | null;
          phone?: string;
          requires_admin_reset?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          staff_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          staff_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_roles_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_roles_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_count_lines: {
        Row: {
          batch_id: string | null;
          count_id: string;
          created_at: string;
          id: string;
          loose_pieces: number;
          ocr_loose_pieces: number | null;
          ocr_pieces_confidence: number | null;
          ocr_whole_cakes: number | null;
          ocr_whole_confidence: number | null;
          pieces_per_cake_snapshot: number | null;
          product_id: string;
          qty_pieces: number | null;
          whole_cakes: number;
        };
        ComputedFields: never;
        Insert: {
          batch_id?: string | null;
          count_id: string;
          created_at?: string;
          id?: string;
          loose_pieces?: number;
          ocr_loose_pieces?: number | null;
          ocr_pieces_confidence?: number | null;
          ocr_whole_cakes?: number | null;
          ocr_whole_confidence?: number | null;
          pieces_per_cake_snapshot?: number | null;
          product_id: string;
          qty_pieces?: never;
          whole_cakes?: number;
        };
        Update: {
          batch_id?: string | null;
          count_id?: string;
          created_at?: string;
          id?: string;
          loose_pieces?: number;
          ocr_loose_pieces?: number | null;
          ocr_pieces_confidence?: number | null;
          ocr_whole_cakes?: number | null;
          ocr_whole_confidence?: number | null;
          pieces_per_cake_snapshot?: number | null;
          product_id?: string;
          qty_pieces?: never;
          whole_cakes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_count_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "stock_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "stock_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_consumption";
            referencedColumns: ["count_id"];
          },
          {
            foreignKeyName: "stock_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_list";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "v_count_slots_today";
            referencedColumns: ["count_id"];
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_counts: {
        Row: {
          business_date: string;
          confirmed_at: string | null;
          counted_by: string;
          created_at: string;
          form_version_id: string | null;
          id: string;
          is_opening: boolean;
          location_id: string;
          method: Database["public"]["Enums"]["count_method"];
          photo_path: string | null;
          schedule_id: string | null;
          started_at: string;
          status: Database["public"]["Enums"]["count_status"];
        };
        ComputedFields: never;
        Insert: {
          business_date?: string;
          confirmed_at?: string | null;
          counted_by: string;
          created_at?: string;
          form_version_id?: string | null;
          id?: string;
          is_opening?: boolean;
          location_id: string;
          method: Database["public"]["Enums"]["count_method"];
          photo_path?: string | null;
          schedule_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["count_status"];
        };
        Update: {
          business_date?: string;
          confirmed_at?: string | null;
          counted_by?: string;
          created_at?: string;
          form_version_id?: string | null;
          id?: string;
          is_opening?: boolean;
          location_id?: string;
          method?: Database["public"]["Enums"]["count_method"];
          photo_path?: string | null;
          schedule_id?: string | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["count_status"];
        };
        Relationships: [
          {
            foreignKeyName: "stock_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_form_version_id_fkey";
            columns: ["form_version_id"];
            isOneToOne: false;
            referencedRelation: "count_form_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "count_schedules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "v_count_slots_today";
            referencedColumns: ["schedule_id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          batch_id: string | null;
          correction_audit_id: number | null;
          count_line_id: string | null;
          created_by: string | null;
          dispatch_line_id: string | null;
          id: number;
          location_id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          occurred_at: string;
          product_id: string;
          production_line_id: string | null;
          qty_pieces: number;
          receipt_line_id: string | null;
          recorded_at: string;
          return_disposition_id: string | null;
          waste_record_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          batch_id?: string | null;
          correction_audit_id?: number | null;
          count_line_id?: string | null;
          created_by?: string | null;
          dispatch_line_id?: string | null;
          id?: never;
          location_id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          occurred_at: string;
          product_id: string;
          production_line_id?: string | null;
          qty_pieces: number;
          receipt_line_id?: string | null;
          recorded_at?: string;
          return_disposition_id?: string | null;
          waste_record_id?: string | null;
        };
        Update: {
          batch_id?: string | null;
          correction_audit_id?: number | null;
          count_line_id?: string | null;
          created_by?: string | null;
          dispatch_line_id?: string | null;
          id?: never;
          location_id?: string;
          movement_type?: Database["public"]["Enums"]["movement_type"];
          occurred_at?: string;
          product_id?: string;
          production_line_id?: string | null;
          qty_pieces?: number;
          receipt_line_id?: string | null;
          recorded_at?: string;
          return_disposition_id?: string | null;
          waste_record_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "stock_movements_correction_audit_id_fkey";
            columns: ["correction_audit_id"];
            isOneToOne: false;
            referencedRelation: "audit_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_count_line_id_fkey";
            columns: ["count_line_id"];
            isOneToOne: false;
            referencedRelation: "stock_count_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_dispatch_line_id_fkey";
            columns: ["dispatch_line_id"];
            isOneToOne: false;
            referencedRelation: "dispatch_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_production_line_id_fkey";
            columns: ["production_line_id"];
            isOneToOne: false;
            referencedRelation: "production_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_receipt_line_id_fkey";
            columns: ["receipt_line_id"];
            isOneToOne: false;
            referencedRelation: "receipt_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_return_disposition_id_fkey";
            columns: ["return_disposition_id"];
            isOneToOne: false;
            referencedRelation: "return_dispositions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_waste_record_id_fkey";
            columns: ["waste_record_id"];
            isOneToOne: false;
            referencedRelation: "waste_records";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_request_lines: {
        Row: {
          id: string;
          loose_pieces: number;
          pieces_per_cake_snapshot: number | null;
          product_id: string;
          qty_pieces: number | null;
          request_id: string;
          suggested_pieces: number | null;
          whole_cakes: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id: string;
          qty_pieces?: never;
          request_id: string;
          suggested_pieces?: number | null;
          whole_cakes?: number;
        };
        Update: {
          id?: string;
          loose_pieces?: number;
          pieces_per_cake_snapshot?: number | null;
          product_id?: string;
          qty_pieces?: never;
          request_id?: string;
          suggested_pieces?: number | null;
          whole_cakes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stock_request_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_request_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_request_lines_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "stock_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_requests: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          id: string;
          note: string | null;
          requested_at: string;
          requested_by: string;
          requesting_location_id: string;
          status: Database["public"]["Enums"]["request_status"];
          supplying_location_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          id?: string;
          note?: string | null;
          requested_at?: string;
          requested_by: string;
          requesting_location_id: string;
          status?: Database["public"]["Enums"]["request_status"];
          supplying_location_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          id?: string;
          note?: string | null;
          requested_at?: string;
          requested_by?: string;
          requesting_location_id?: string;
          status?: Database["public"]["Enums"]["request_status"];
          supplying_location_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_requests_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_requesting_location_id_fkey";
            columns: ["requesting_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_supplying_location_id_fkey";
            columns: ["supplying_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      waste_records: {
        Row: {
          batch_id: string | null;
          created_at: string;
          entered_qty: number;
          entered_unit: Database["public"]["Enums"]["entry_unit"];
          id: string;
          location_id: string;
          occurred_at: string;
          photo_path: string | null;
          pieces_per_cake_snapshot: number | null;
          product_id: string;
          qty_pieces: number | null;
          reason: Database["public"]["Enums"]["waste_reason"];
          reason_note: string | null;
          recorded_by: string;
        };
        ComputedFields: never;
        Insert: {
          batch_id?: string | null;
          created_at?: string;
          entered_qty: number;
          entered_unit: Database["public"]["Enums"]["entry_unit"];
          id?: string;
          location_id: string;
          occurred_at?: string;
          photo_path?: string | null;
          pieces_per_cake_snapshot?: number | null;
          product_id: string;
          qty_pieces?: never;
          reason: Database["public"]["Enums"]["waste_reason"];
          reason_note?: string | null;
          recorded_by: string;
        };
        Update: {
          batch_id?: string | null;
          created_at?: string;
          entered_qty?: number;
          entered_unit?: Database["public"]["Enums"]["entry_unit"];
          id?: string;
          location_id?: string;
          occurred_at?: string;
          photo_path?: string | null;
          pieces_per_cake_snapshot?: number | null;
          product_id?: string;
          qty_pieces?: never;
          reason?: Database["public"]["Enums"]["waste_reason"];
          reason_note?: string | null;
          recorded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waste_records_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_records_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "waste_records_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_records_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_records_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_records_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_records_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_branch_stock_age: {
        Row: {
          age_days: number | null;
          is_expired: boolean | null;
          location_id: string | null;
          near_expiry: boolean | null;
          oldest_receipt_at: string | null;
          product_id: string | null;
          qty_pieces: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      v_count_consumption: {
        Row: {
          business_date: string | null;
          consumed_pieces: number | null;
          count_id: string | null;
          location_id: string | null;
          product_id: string | null;
          started_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "stock_count_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_count_lines_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_count_list: {
        Row: {
          business_date: string | null;
          confirmed_at: string | null;
          consumed_cakes: number | null;
          consumed_loose_only: number | null;
          consumed_pieces: number | null;
          counted_by: string | null;
          id: string | null;
          impossible_lines: number | null;
          is_opening: boolean | null;
          line_count: number | null;
          location_id: string | null;
          method: Database["public"]["Enums"]["count_method"] | null;
          photo_path: string | null;
          schedule_time: string | null;
          staff_corrected_lines: number | null;
          started_at: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "stock_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_counts_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_count_slots_today: {
        Row: {
          confirmed_at: string | null;
          count_id: string | null;
          location_id: string | null;
          schedule_id: string | null;
          slot_at: string | null;
          status: string | null;
          time_of_day: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "count_schedules_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_factory_batches: {
        Row: {
          age_days: number | null;
          batch_id: string | null;
          day_number: number | null;
          expires_on: string | null;
          is_expired: boolean | null;
          is_last_day: boolean | null;
          location_id: string | null;
          product_id: string | null;
          production_date: string | null;
          qty_pieces: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_products: {
        Row: {
          created_at: string | null;
          effective_pieces_per_cake: number | null;
          id: string | null;
          image_path: string | null;
          is_active: boolean | null;
          name_ar: string | null;
          name_en: string | null;
          pieces_per_cake: number | null;
          sell_mode: Database["public"]["Enums"]["sell_mode"] | null;
          sort_order: number | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      v_raw_stock: {
        Row: {
          avg_daily_issue: number | null;
          base_unit: string | null;
          below_min: boolean | null;
          days_left: number | null;
          location_id: string | null;
          material_id: string | null;
          min_qty: number | null;
          qty_base: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "raw_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_staff_names: {
        Row: {
          full_name: string | null;
          id: string | null;
          location_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          full_name?: string | null;
          id?: string | null;
          location_id?: string | null;
        };
        Update: {
          full_name?: string | null;
          id?: string | null;
          location_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_stock_by_product: {
        Row: {
          last_movement_at: string | null;
          location_id: string | null;
          product_id: string | null;
          qty_pieces: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      v_stock_current: {
        Row: {
          batch_id: string | null;
          last_movement_at: string | null;
          location_id: string | null;
          product_id: string | null;
          qty_pieces: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "v_factory_batches";
            referencedColumns: ["batch_id"];
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "v_products";
            referencedColumns: ["id"];
          },
        ];
      };
      v_unreceived_dispatches: {
        Row: {
          dispatched_at: string | null;
          dispatched_by: string | null;
          from_location_id: string | null;
          hours_in_transit: number | null;
          id: string | null;
          is_overdue: boolean | null;
          kind: Database["public"]["Enums"]["dispatch_kind"] | null;
          note: string | null;
          request_id: string | null;
          status: Database["public"]["Enums"]["dispatch_status"] | null;
          to_location_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "dispatches_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "v_staff_names";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "stock_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dispatches_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      admin_correct_count_line: {
        Args: { p_line_id: string; p_loose_pieces: number; p_reason: string; p_whole_cakes: number };
        Returns: undefined;
      };
      admin_decide_request: { Args: { p_approve: boolean; p_request_id: string }; Returns: undefined };
      admin_import_raw_count: { Args: { p_rows: Json; p_started_at?: string }; Returns: string };
      admin_record_pin_reset: { Args: { p_staff_id: string }; Returns: undefined };
      admin_resolve_receipt_line: {
        Args: {
          p_line_id: string;
          p_note?: string;
          p_resolution: Database["public"]["Enums"]["discrepancy_resolution"];
        };
        Returns: undefined;
      };
      admin_save_staff: {
        Args: {
          p_full_name: string;
          p_location_id?: string;
          p_phone: string;
          p_roles: Database["public"]["Enums"]["app_role"][];
          p_staff_id: string;
        };
        Returns: undefined;
      };
      admin_set_staff_active: { Args: { p_active: boolean; p_staff_id: string }; Returns: undefined };
      amman_today: { Args: Record<PropertyKey, never>; Returns: string };
      auth_record_login_success: { Args: { p_attempt_id: number; p_staff_id: string }; Returns: undefined };
      auth_reserve_login_attempt: {
        Args: { p_ip?: unknown; p_phone: string };
        Returns: {
          attempt_id: number;
          staff_id: string;
          status: string;
        }[];
      };
      branch_suggestions: {
        Args: { p_branch_id: string };
        Returns: {
          par_pieces: number;
          product_id: string;
          stock_pieces: number;
        }[];
      };
      cancel_request: { Args: { p_request_id: string }; Returns: undefined };
      count_breakdown: {
        Args: { p_count_id: string };
        Returns: {
          adjustment_qty: number;
          batch_id: string;
          counted_qty: number;
          expected_qty: number;
          in_qty: number;
          line_id: string;
          loose_pieces: number;
          ocr_loose_pieces: number;
          ocr_pieces_confidence: number;
          ocr_whole_cakes: number;
          ocr_whole_confidence: number;
          other_qty: number;
          out_qty: number;
          pieces_per_cake: number;
          prev_qty: number;
          product_id: string;
          waste_qty: number;
          whole_cakes: number;
        }[];
      };
      create_dispatch: {
        Args: {
          p_confirm_fefo_override?: boolean;
          p_driver_name?: string;
          p_lines: Json;
          p_note?: string;
          p_request_id?: string;
          p_to_location_id: string;
        };
        Returns: string;
      };
      create_request: { Args: { p_lines: Json; p_note?: string }; Returns: string };
      day_number: { Args: { d: string }; Returns: number };
      decide_return: {
        Args: {
          p_receipt_line_id: string;
          p_to_stock_pieces: number;
          p_to_stock_production_date?: string;
          p_to_waste_pieces: number;
        };
        Returns: string;
      };
      receive_dispatch: { Args: { p_dispatch_id: string; p_lines: Json }; Returns: string };
      record_production: { Args: { p_lines: Json; p_note?: string }; Returns: string };
      record_raw_movement: {
        Args: {
          p_invoice_photo_path?: string;
          p_kind: Database["public"]["Enums"]["raw_movement_type"];
          p_material_id: string;
          p_qty: number;
          p_supplier_name?: string;
          p_unit_id?: string;
        };
        Returns: number;
      };
      record_waste: {
        Args: {
          p_location_id: string;
          p_note?: string;
          p_photo_path?: string;
          p_product_id: string;
          p_production_date?: string;
          p_qty: number;
          p_reason: Database["public"]["Enums"]["waste_reason"];
          p_unit: Database["public"]["Enums"]["entry_unit"];
        };
        Returns: string;
      };
      submit_count: {
        Args: {
          p_form_version_id?: string;
          p_lines: Json;
          p_location_id: string;
          p_method?: Database["public"]["Enums"]["count_method"];
          p_photo_path?: string;
          p_schedule_id?: string;
          p_started_at?: string;
        };
        Returns: string;
      };
      submit_raw_count: { Args: { p_lines: Json; p_started_at?: string }; Returns: string };
    };
    Enums: {
      ai_feature: "count_ocr" | "assistant";
      app_role: "admin" | "branch_staff" | "dispatcher" | "storekeeper";
      count_method: "manual" | "photo";
      count_status: "draft" | "confirmed";
      discrepancy_resolution: "waste" | "review" | "resolved";
      dispatch_kind: "replenishment" | "transfer" | "return";
      dispatch_status: "in_transit" | "received" | "cancelled";
      entry_unit: "cake" | "piece";
      location_kind: "factory" | "branch" | "returns_bin";
      movement_type:
        | "opening_balance"
        | "count_adjustment"
        | "waste"
        | "production"
        | "dispatch_out"
        | "receipt_in"
        | "return_to_stock"
        | "admin_correction";
      notification_kind: "count_reminder" | "count_late" | "dispatch_unreceived";
      raw_movement_type: "opening_balance" | "receipt" | "issue" | "count_adjustment" | "admin_correction";
      request_status: "pending_approval" | "sent" | "dispatched" | "received" | "cancelled";
      sell_mode: "whole_and_pieces" | "pieces_only";
      waste_reason: "expired" | "broken" | "other";
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_feature: ["count_ocr", "assistant"],
      app_role: ["admin", "branch_staff", "dispatcher", "storekeeper"],
      count_method: ["manual", "photo"],
      count_status: ["draft", "confirmed"],
      discrepancy_resolution: ["waste", "review", "resolved"],
      dispatch_kind: ["replenishment", "transfer", "return"],
      dispatch_status: ["in_transit", "received", "cancelled"],
      entry_unit: ["cake", "piece"],
      location_kind: ["factory", "branch", "returns_bin"],
      movement_type: [
        "opening_balance",
        "count_adjustment",
        "waste",
        "production",
        "dispatch_out",
        "receipt_in",
        "return_to_stock",
        "admin_correction",
      ],
      notification_kind: ["count_reminder", "count_late", "dispatch_unreceived"],
      raw_movement_type: ["opening_balance", "receipt", "issue", "count_adjustment", "admin_correction"],
      request_status: ["pending_approval", "sent", "dispatched", "received", "cancelled"],
      sell_mode: ["whole_and_pieces", "pieces_only"],
      waste_reason: ["expired", "broken", "other"],
    },
  },
} as const;
