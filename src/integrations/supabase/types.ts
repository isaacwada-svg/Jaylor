export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: string | null;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value?: string | null;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string | null;
          entity_id: string | null;
          id: string;
          metadata: Json;
          store_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          metadata?: Json;
          store_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
          metadata?: Json;
          store_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          store_id: string;
          full_name: string;
          phone: string;
          whatsapp_phone: string | null;
          gender: string | null;
          birthday: string | null;
          address: string | null;
          photo_url: string | null;
          notes: string | null;
          tags: string[];
          guardian_name: string | null;
          guardian_phone: string | null;
          consent_whatsapp: boolean;
          consent_whatsapp_at: string | null;
          consent_photos: boolean;
          consent_photos_at: string | null;
          household_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          full_name: string;
          phone: string;
          whatsapp_phone?: string | null;
          gender?: string | null;
          birthday?: string | null;
          address?: string | null;
          photo_url?: string | null;
          notes?: string | null;
          tags?: string[];
          guardian_name?: string | null;
          guardian_phone?: string | null;
          consent_whatsapp?: boolean;
          consent_whatsapp_at?: string | null;
          consent_photos?: boolean;
          consent_photos_at?: string | null;
          household_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          full_name?: string;
          phone?: string;
          whatsapp_phone?: string | null;
          gender?: string | null;
          birthday?: string | null;
          address?: string | null;
          photo_url?: string | null;
          notes?: string | null;
          tags?: string[];
          guardian_name?: string | null;
          guardian_phone?: string | null;
          consent_whatsapp?: boolean;
          consent_whatsapp_at?: string | null;
          consent_photos?: boolean;
          consent_photos_at?: string | null;
          household_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      consultation_requests: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          phone: string;
          type: string;
          preferred_at: string;
          note: string | null;
          consent_whatsapp: boolean;
          status: string;
          consultation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          phone: string;
          type: string;
          preferred_at: string;
          note?: string | null;
          consent_whatsapp?: boolean;
          status?: string;
          consultation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          phone?: string;
          type?: string;
          preferred_at?: string;
          note?: string | null;
          consent_whatsapp?: boolean;
          status?: string;
          consultation_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consultation_requests_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultation_requests_consultation_id_fkey";
            columns: ["consultation_id"];
            isOneToOne: false;
            referencedRelation: "consultations";
            referencedColumns: ["id"];
          },
        ];
      };
      consultations: {
        Row: {
          id: string;
          store_id: string;
          client_id: string | null;
          staff_id: string | null;
          type: string;
          starts_at: string;
          ends_at: string;
          status: string;
          meeting_link: string | null;
          notes: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          client_id?: string | null;
          staff_id?: string | null;
          type: string;
          starts_at: string;
          ends_at: string;
          status?: string;
          meeting_link?: string | null;
          notes?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          client_id?: string | null;
          staff_id?: string | null;
          type?: string;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          meeting_link?: string | null;
          notes?: string | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consultations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consultations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          store_id: string;
          category: string;
          amount: number;
          spent_at: string;
          note: string | null;
          receipt_url: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          category: string;
          amount: number;
          spent_at?: string;
          note?: string | null;
          receipt_url?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          category?: string;
          amount?: number;
          spent_at?: string;
          note?: string | null;
          receipt_url?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      store_invites: {
        Row: {
          id: string;
          store_id: string;
          email: string | null;
          phone: string | null;
          role: Database["public"]["Enums"]["store_role"];
          token: string;
          status: string;
          invited_by: string | null;
          accepted_by: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          email?: string | null;
          phone?: string | null;
          role: Database["public"]["Enums"]["store_role"];
          token?: string;
          status?: string;
          invited_by?: string | null;
          accepted_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          email?: string | null;
          phone?: string | null;
          role?: Database["public"]["Enums"]["store_role"];
          token?: string;
          status?: string;
          invited_by?: string | null;
          accepted_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_invites_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          event_date: string | null;
          organiser_name: string | null;
          organiser_phone: string | null;
          fabric_description: string | null;
          styles: Json;
          price_per_person: number | null;
          deposit_amount: number | null;
          measurement_deadline: string | null;
          delivery_date: string | null;
          public_token: string;
          status: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          event_date?: string | null;
          organiser_name?: string | null;
          organiser_phone?: string | null;
          fabric_description?: string | null;
          styles?: Json;
          price_per_person?: number | null;
          deposit_amount?: number | null;
          measurement_deadline?: string | null;
          delivery_date?: string | null;
          public_token?: string;
          status?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          event_date?: string | null;
          organiser_name?: string | null;
          organiser_phone?: string | null;
          fabric_description?: string | null;
          styles?: Json;
          price_per_person?: number | null;
          deposit_amount?: number | null;
          measurement_deadline?: string | null;
          delivery_date?: string | null;
          public_token?: string;
          status?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      event_participants: {
        Row: {
          id: string;
          event_id: string;
          store_id: string;
          client_id: string | null;
          full_name: string;
          phone: string;
          style_key: string | null;
          measurement_choice: string | null;
          status: string;
          token: string;
          paid_amount: number;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          store_id: string;
          client_id?: string | null;
          full_name: string;
          phone: string;
          style_key?: string | null;
          measurement_choice?: string | null;
          status?: string;
          token?: string;
          paid_amount?: number;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          store_id?: string;
          client_id?: string | null;
          full_name?: string;
          phone?: string;
          style_key?: string | null;
          measurement_choice?: string | null;
          status?: string;
          token?: string;
          paid_amount?: number;
          order_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_participants_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_participants_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_participants_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      country_configs: {
        Row: {
          code: string;
          currency: string;
          dial_code: string;
          is_active: boolean;
          languages: Json;
          name: string;
          payment_providers: Json;
          tax_label: string | null;
          timezone: string;
        };
        Insert: {
          code: string;
          currency: string;
          dial_code: string;
          is_active?: boolean;
          languages?: Json;
          name: string;
          payment_providers?: Json;
          tax_label?: string | null;
          timezone: string;
        };
        Update: {
          code?: string;
          currency?: string;
          dial_code?: string;
          is_active?: boolean;
          languages?: Json;
          name?: string;
          payment_providers?: Json;
          tax_label?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      measurement_sets: {
        Row: {
          id: string;
          store_id: string;
          client_id: string;
          template_id: string | null;
          values: Json;
          extra_fields: Json;
          growth_allowance: Json;
          version: number;
          unit: string;
          source: string;
          taken_by: string | null;
          taken_at: string;
          notes: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          client_id: string;
          template_id?: string | null;
          values?: Json;
          extra_fields?: Json;
          growth_allowance?: Json;
          version?: number;
          unit?: string;
          source?: string;
          taken_by?: string | null;
          taken_at?: string;
          notes?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          client_id?: string;
          template_id?: string | null;
          values?: Json;
          extra_fields?: Json;
          growth_allowance?: Json;
          version?: number;
          unit?: string;
          source?: string;
          taken_by?: string | null;
          taken_at?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_sets_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "measurement_sets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "measurement_sets_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "measurement_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      measurement_templates: {
        Row: {
          age_group: string;
          created_at: string;
          created_by: string | null;
          fields: Json;
          hidden: boolean;
          id: string;
          is_custom: boolean;
          is_default: boolean;
          name: string;
          sex: string;
          store_id: string;
        };
        Insert: {
          age_group: string;
          created_at?: string;
          created_by?: string | null;
          fields?: Json;
          hidden?: boolean;
          id?: string;
          is_custom?: boolean;
          is_default?: boolean;
          name: string;
          sex: string;
          store_id: string;
        };
        Update: {
          age_group?: string;
          created_at?: string;
          created_by?: string | null;
          fields?: Json;
          hidden?: boolean;
          id?: string;
          is_custom?: boolean;
          is_default?: boolean;
          name?: string;
          sex?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_templates_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          store_id: string;
          client_id: string | null;
          order_id: string | null;
          template: string;
          channel: string;
          status: string;
          sent_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          client_id?: string | null;
          order_id?: string | null;
          template: string;
          channel?: string;
          status?: string;
          sent_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          client_id?: string | null;
          order_id?: string | null;
          template?: string;
          channel?: string;
          status?: string;
          sent_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_materials: {
        Row: {
          id: string;
          order_id: string;
          store_id: string;
          source: string;
          description: string | null;
          colour: string | null;
          yards: number | null;
          cost: number;
          photo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          store_id: string;
          source: string;
          description?: string | null;
          colour?: string | null;
          yards?: number | null;
          cost?: number;
          photo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          store_id?: string;
          source?: string;
          description?: string | null;
          colour?: string | null;
          yards?: number | null;
          cost?: number;
          photo_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_materials_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_materials_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: string | null;
          to_status: string;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: string | null;
          to_status: string;
          changed_by?: string | null;
          changed_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          from_status?: string | null;
          to_status?: string;
          changed_by?: string | null;
          changed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          number: string;
          client_id: string;
          garment_type: string;
          style_notes: string | null;
          measurement_set_id: string | null;
          quantity: number;
          price: number;
          delivery_date: string | null;
          status: string;
          priority: string;
          assigned_to: string | null;
          ready_at: string | null;
          collected_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          number?: string;
          client_id: string;
          garment_type: string;
          style_notes?: string | null;
          measurement_set_id?: string | null;
          quantity?: number;
          price?: number;
          delivery_date?: string | null;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
          ready_at?: string | null;
          collected_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          number?: string;
          client_id?: string;
          garment_type?: string;
          style_notes?: string | null;
          measurement_set_id?: string | null;
          quantity?: number;
          price?: number;
          delivery_date?: string | null;
          status?: string;
          priority?: string;
          assigned_to?: string | null;
          ready_at?: string | null;
          collected_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_measurement_set_id_fkey";
            columns: ["measurement_set_id"];
            isOneToOne: false;
            referencedRelation: "measurement_sets";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          amount: number;
          method: string;
          reference: string | null;
          received_by: string | null;
          paid_at: string;
          paystack_ref: string | null;
          voided: boolean;
          void_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          amount: number;
          method: string;
          reference?: string | null;
          received_by?: string | null;
          paid_at?: string;
          paystack_ref?: string | null;
          voided?: boolean;
          void_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          amount?: number;
          method?: string;
          reference?: string | null;
          received_by?: string | null;
          paid_at?: string;
          paystack_ref?: string | null;
          voided?: boolean;
          void_reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          code: string;
          created_at: string;
          currency: string;
          features: Json;
          limits: Json;
          name: string;
          price_monthly: number | null;
          price_quarterly: number | null;
          sort_order: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          currency?: string;
          features?: Json;
          limits?: Json;
          name: string;
          price_monthly?: number | null;
          price_quarterly?: number | null;
          sort_order?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          currency?: string;
          features?: Json;
          limits?: Json;
          name?: string;
          price_monthly?: number | null;
          price_quarterly?: number | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_members: {
        Row: {
          created_at: string;
          id: string;
          invited_phone: string | null;
          role: Database["public"]["Enums"]["store_role"];
          status: string;
          store_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_phone?: string | null;
          role?: Database["public"]["Enums"]["store_role"];
          status?: string;
          store_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_phone?: string | null;
          role?: Database["public"]["Enums"]["store_role"];
          status?: string;
          store_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      store_settings: {
        Row: {
          email: string | null;
          phone: string | null;
          public_location: string | null;
          receipt_footer: string | null;
          registered_address: string | null;
          store_id: string;
          updated_at: string;
          whatsapp_number: string | null;
        };
        Insert: {
          email?: string | null;
          phone?: string | null;
          public_location?: string | null;
          receipt_footer?: string | null;
          registered_address?: string | null;
          store_id: string;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Update: {
          email?: string | null;
          phone?: string | null;
          public_location?: string | null;
          receipt_footer?: string | null;
          registered_address?: string | null;
          store_id?: string;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: true;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      storefront_items: {
        Row: {
          id: string;
          store_id: string;
          title: string;
          category: string | null;
          description: string | null;
          photos: string[];
          price_min: number | null;
          price_max: number | null;
          turnaround_days: number | null;
          is_ready_made: boolean;
          sizes_stock: Json;
          published: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          title: string;
          category?: string | null;
          description?: string | null;
          photos?: string[];
          price_min?: number | null;
          price_max?: number | null;
          turnaround_days?: number | null;
          is_ready_made?: boolean;
          sizes_stock?: Json;
          published?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          title?: string;
          category?: string | null;
          description?: string | null;
          photos?: string[];
          price_min?: number | null;
          price_max?: number | null;
          turnaround_days?: number | null;
          is_ready_made?: boolean;
          sizes_stock?: Json;
          published?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storefront_items_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      sew_requests: {
        Row: {
          id: string;
          store_id: string;
          item_id: string | null;
          client_name: string;
          phone: string;
          fabric_source: string;
          notes: string | null;
          measurement_choice: string;
          status: string;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          item_id?: string | null;
          client_name: string;
          phone: string;
          fabric_source: string;
          notes?: string | null;
          measurement_choice?: string;
          status?: string;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          item_id?: string | null;
          client_name?: string;
          phone?: string;
          fabric_source?: string;
          notes?: string | null;
          measurement_choice?: string;
          status?: string;
          order_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sew_requests_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sew_requests_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "storefront_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sew_requests_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      stores: {
        Row: {
          accent_color: string | null;
          bio: string | null;
          city: string | null;
          country_code: string;
          cover_url: string | null;
          created_at: string;
          currency: string;
          garment_types: string[] | null;
          id: string;
          is_active: boolean;
          legal_line: string | null;
          logo_url: string | null;
          name: string;
          onboarding_completed: boolean;
          opening_hours: string | null;
          owner_id: string;
          plan_code: string;
          sews_for: string | null;
          slug: string;
          timezone: string;
          trial_ends_at: string;
          unit: Database["public"]["Enums"]["measurement_unit"];
          updated_at: string;
          whatsapp_phone: string | null;
        };
        Insert: {
          accent_color?: string | null;
          bio?: string | null;
          city?: string | null;
          country_code?: string;
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          garment_types?: string[] | null;
          id?: string;
          is_active?: boolean;
          legal_line?: string | null;
          logo_url?: string | null;
          name: string;
          onboarding_completed?: boolean;
          opening_hours?: string | null;
          owner_id: string;
          plan_code?: string;
          sews_for?: string | null;
          slug: string;
          timezone?: string;
          trial_ends_at?: string;
          unit?: Database["public"]["Enums"]["measurement_unit"];
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Update: {
          accent_color?: string | null;
          bio?: string | null;
          city?: string | null;
          country_code?: string;
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          garment_types?: string[] | null;
          id?: string;
          is_active?: boolean;
          legal_line?: string | null;
          logo_url?: string | null;
          name?: string;
          onboarding_completed?: boolean;
          opening_hours?: string | null;
          owner_id?: string;
          plan_code?: string;
          sews_for?: string | null;
          slug?: string;
          timezone?: string;
          trial_ends_at?: string;
          unit?: Database["public"]["Enums"]["measurement_unit"];
          updated_at?: string;
          whatsapp_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stores_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "country_configs";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "stores_plan_code_fkey";
            columns: ["plan_code"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["code"];
          },
        ];
      };
      usage_counters: {
        Row: {
          store_id: string;
          month: string;
          orders: number;
          messages: number;
          ai_scans: number;
          ai_previews: number;
          voice_orders: number;
        };
        Insert: {
          store_id: string;
          month: string;
          orders?: number;
          messages?: number;
          ai_scans?: number;
          ai_previews?: number;
          voice_orders?: number;
        };
        Update: {
          store_id?: string;
          month?: string;
          orders?: number;
          messages?: number;
          ai_scans?: number;
          ai_previews?: number;
          voice_orders?: number;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      stores_public: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          cover_url: string | null;
          accent_color: string | null;
          city: string | null;
          bio: string | null;
          whatsapp_phone: string | null;
          opening_hours: string | null;
        };
        Relationships: [];
      };
      order_balances: {
        Row: {
          order_id: string;
          store_id: string;
          total: number;
          paid: number;
          balance: number;
        };
        Relationships: [];
      };
      orders_for_tailor: {
        Row: {
          id: string;
          store_id: string;
          number: string;
          client_id: string;
          garment_type: string;
          style_notes: string | null;
          measurement_set_id: string | null;
          quantity: number;
          delivery_date: string | null;
          status: string;
          priority: string;
          assigned_to: string | null;
          ready_at: string | null;
          collected_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_use_feature: {
        Args: { _feature: string; _store_id: string };
        Returns: boolean;
      };
      effective_plan_code: { Args: { _store_id: string }; Returns: string };
      feature_usage: {
        Args: { p_store_id: string; p_feature: string };
        Returns: Json;
      };
      increment_usage_counter: {
        Args: { p_store_id: string; p_column: string };
        Returns: undefined;
      };
      get_participant_by_token: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_invite_by_token: {
        Args: { p_token: string };
        Returns: Json;
      };
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      set_participant_style: {
        Args: { p_token: string; p_style_key: string };
        Returns: undefined;
      };
      set_participant_measurement_choice: {
        Args: { p_token: string; p_choice: string };
        Returns: undefined;
      };
      has_store_role: {
        Args: {
          _roles: Database["public"]["Enums"]["store_role"][];
          _store_id: string;
        };
        Returns: boolean;
      };
      is_store_member: { Args: { _store_id: string }; Returns: boolean };
    };
    Enums: {
      measurement_unit: "in" | "cm";
      store_role: "owner" | "manager" | "tailor";
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
      measurement_unit: ["in", "cm"],
      store_role: ["owner", "manager", "tailor"],
    },
  },
} as const;
