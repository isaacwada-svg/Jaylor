export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_design_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          phone: string
          reference: string
          status: string
          store_id: string
          used: boolean
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          phone: string
          reference: string
          status?: string
          store_id: string
          used?: boolean
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          phone?: string
          reference?: string
          status?: string
          store_id?: string
          used?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_design_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_design_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_designs: {
        Row: {
          client_name: string
          created_at: string
          description: string
          id: string
          image_url: string
          measurements: Json
          payment_id: string | null
          phone: string
          selfie_url: string | null
          sew_request_id: string | null
          share_token: string
          store_id: string
          was_paid: boolean
        }
        Insert: {
          client_name: string
          created_at?: string
          description: string
          id?: string
          image_url: string
          measurements?: Json
          payment_id?: string | null
          phone: string
          selfie_url?: string | null
          sew_request_id?: string | null
          share_token?: string
          store_id: string
          was_paid?: boolean
        }
        Update: {
          client_name?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string
          measurements?: Json
          payment_id?: string | null
          phone?: string
          selfie_url?: string | null
          sew_request_id?: string | null
          share_token?: string
          store_id?: string
          was_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_designs_sew_request_id_fkey"
            columns: ["sew_request_id"]
            isOneToOne: false
            referencedRelation: "sew_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_designs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_designs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json
          store_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          store_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          birthday: string | null
          consent_photos: boolean
          consent_photos_at: string | null
          consent_whatsapp: boolean
          consent_whatsapp_at: string | null
          created_at: string
          created_by: string | null
          full_name: string
          gender: string | null
          guardian_name: string | null
          guardian_phone: string | null
          household_id: string | null
          id: string
          notes: string | null
          phone: string
          photo_url: string | null
          store_id: string
          tags: string[]
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          address?: string | null
          birthday?: string | null
          consent_photos?: boolean
          consent_photos_at?: string | null
          consent_whatsapp?: boolean
          consent_whatsapp_at?: string | null
          created_at?: string
          created_by?: string | null
          full_name: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          household_id?: string | null
          id?: string
          notes?: string | null
          phone: string
          photo_url?: string | null
          store_id: string
          tags?: string[]
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          address?: string | null
          birthday?: string | null
          consent_photos?: boolean
          consent_photos_at?: string | null
          consent_whatsapp?: boolean
          consent_whatsapp_at?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          household_id?: string | null
          id?: string
          notes?: string | null
          phone?: string
          photo_url?: string | null
          store_id?: string
          tags?: string[]
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_requests: {
        Row: {
          consent_whatsapp: boolean
          consultation_id: string | null
          created_at: string
          id: string
          name: string
          note: string | null
          phone: string
          preferred_at: string
          status: string
          store_id: string
          type: string
        }
        Insert: {
          consent_whatsapp?: boolean
          consultation_id?: string | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          phone: string
          preferred_at: string
          status?: string
          store_id: string
          type: string
        }
        Update: {
          consent_whatsapp?: boolean
          consultation_id?: string | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          phone?: string
          preferred_at?: string
          status?: string
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_requests_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          client_id: string | null
          created_at: string
          ends_at: string
          id: string
          meeting_link: string | null
          notes: string | null
          source: string
          staff_id: string | null
          starts_at: string
          status: string
          store_id: string
          type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          meeting_link?: string | null
          notes?: string | null
          source?: string
          staff_id?: string | null
          starts_at: string
          status?: string
          store_id: string
          type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          meeting_link?: string | null
          notes?: string | null
          source?: string
          staff_id?: string | null
          starts_at?: string
          status?: string
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      country_configs: {
        Row: {
          code: string
          currency: string
          dial_code: string
          is_active: boolean
          languages: Json
          name: string
          payment_providers: Json
          tax_label: string | null
          timezone: string
        }
        Insert: {
          code: string
          currency: string
          dial_code: string
          is_active?: boolean
          languages?: Json
          name: string
          payment_providers?: Json
          tax_label?: string | null
          timezone: string
        }
        Update: {
          code?: string
          currency?: string
          dial_code?: string
          is_active?: boolean
          languages?: Json
          name?: string
          payment_providers?: Json
          tax_label?: string | null
          timezone?: string
        }
        Relationships: []
      }
      event_participants: {
        Row: {
          client_id: string | null
          created_at: string
          event_id: string
          full_name: string
          id: string
          measurement_choice: string | null
          order_id: string | null
          paid_amount: number
          phone: string
          status: string
          store_id: string
          style_key: string | null
          token: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          measurement_choice?: string | null
          order_id?: string | null
          paid_amount?: number
          phone: string
          status?: string
          store_id: string
          style_key?: string | null
          token?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          measurement_choice?: string | null
          order_id?: string | null
          paid_amount?: number
          phone?: string
          status?: string
          store_id?: string
          style_key?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "event_participants_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_date: string | null
          deposit_amount: number | null
          event_date: string | null
          fabric_description: string | null
          id: string
          measurement_deadline: string | null
          name: string
          organiser_name: string | null
          organiser_phone: string | null
          price_per_person: number | null
          public_token: string
          status: string
          store_id: string
          styles: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          deposit_amount?: number | null
          event_date?: string | null
          fabric_description?: string | null
          id?: string
          measurement_deadline?: string | null
          name: string
          organiser_name?: string | null
          organiser_phone?: string | null
          price_per_person?: number | null
          public_token?: string
          status?: string
          store_id: string
          styles?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          deposit_amount?: number | null
          event_date?: string | null
          fabric_description?: string | null
          id?: string
          measurement_deadline?: string | null
          name?: string
          organiser_name?: string | null
          organiser_phone?: string | null
          price_per_person?: number | null
          public_token?: string
          status?: string
          store_id?: string
          styles?: Json
        }
        Relationships: [
          {
            foreignKeyName: "events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          receipt_url: string | null
          spent_at: string
          store_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          receipt_url?: string | null
          spent_at?: string
          store_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          receipt_url?: string | null
          spent_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string
        }
        Relationships: []
      }
      measurement_sets: {
        Row: {
          client_id: string
          extra_fields: Json
          growth_allowance: Json
          id: string
          notes: string | null
          source: string
          store_id: string
          taken_at: string
          taken_by: string | null
          template_id: string | null
          unit: string
          values: Json
          version: number
        }
        Insert: {
          client_id: string
          extra_fields?: Json
          growth_allowance?: Json
          id?: string
          notes?: string | null
          source?: string
          store_id: string
          taken_at?: string
          taken_by?: string | null
          template_id?: string | null
          unit?: string
          values?: Json
          version?: number
        }
        Update: {
          client_id?: string
          extra_fields?: Json
          growth_allowance?: Json
          id?: string
          notes?: string | null
          source?: string
          store_id?: string
          taken_at?: string
          taken_by?: string | null
          template_id?: string | null
          unit?: string
          values?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurement_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_sets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_sets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_sets_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "measurement_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_templates: {
        Row: {
          age_group: string
          created_at: string
          created_by: string | null
          fields: Json
          hidden: boolean
          id: string
          is_custom: boolean
          is_default: boolean
          name: string
          sex: string
          store_id: string
        }
        Insert: {
          age_group: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          hidden?: boolean
          id?: string
          is_custom?: boolean
          is_default?: boolean
          name: string
          sex: string
          store_id: string
        }
        Update: {
          age_group?: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          hidden?: boolean
          id?: string
          is_custom?: boolean
          is_default?: boolean
          name?: string
          sex?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: string
          client_id: string | null
          created_at: string
          id: string
          order_id: string | null
          sent_by: string | null
          status: string
          store_id: string
          template: string
        }
        Insert: {
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          sent_by?: string | null
          status?: string
          store_id: string
          template: string
        }
        Update: {
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          sent_by?: string | null
          status?: string
          store_id?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_materials: {
        Row: {
          colour: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          order_id: string
          photo_url: string | null
          source: string
          store_id: string
          yards: number | null
        }
        Insert: {
          colour?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id: string
          photo_url?: string | null
          source: string
          store_id: string
          yards?: number | null
        }
        Update: {
          colour?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string
          photo_url?: string | null
          source?: string
          store_id?: string
          yards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_materials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_materials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: string
          order_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          order_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: string
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_to: string | null
          client_id: string
          collected_at: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          garment_type: string
          id: string
          measurement_set_id: string | null
          number: string
          price: number
          priority: string
          quantity: number
          ready_at: string | null
          status: string
          store_id: string
          style_notes: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          garment_type: string
          id?: string
          measurement_set_id?: string | null
          number: string
          price?: number
          priority?: string
          quantity?: number
          ready_at?: string | null
          status?: string
          store_id: string
          style_notes?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          collected_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          garment_type?: string
          id?: string
          measurement_set_id?: string | null
          number?: string
          price?: number
          priority?: string
          quantity?: number
          ready_at?: string | null
          status?: string
          store_id?: string
          style_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_measurement_set_id_fkey"
            columns: ["measurement_set_id"]
            isOneToOne: false
            referencedRelation: "measurement_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          order_id: string
          paid_at: string
          paystack_ref: string | null
          received_by: string | null
          reference: string | null
          store_id: string
          void_reason: string | null
          voided: boolean
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          order_id: string
          paid_at?: string
          paystack_ref?: string | null
          received_by?: string | null
          reference?: string | null
          store_id: string
          void_reason?: string | null
          voided?: boolean
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          paid_at?: string
          paystack_ref?: string | null
          received_by?: string | null
          reference?: string | null
          store_id?: string
          void_reason?: string | null
          voided?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          features: Json
          limits: Json
          name: string
          price_monthly: number | null
          price_quarterly: number | null
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          features?: Json
          limits?: Json
          name: string
          price_monthly?: number | null
          price_quarterly?: number | null
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          features?: Json
          limits?: Json
          name?: string
          price_monthly?: number | null
          price_quarterly?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          key: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          key: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          key?: string
        }
        Relationships: []
      }
      sew_requests: {
        Row: {
          client_name: string
          created_at: string
          fabric_source: string
          id: string
          item_id: string | null
          measurement_choice: string
          notes: string | null
          order_id: string | null
          phone: string
          status: string
          store_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          fabric_source: string
          id?: string
          item_id?: string | null
          measurement_choice?: string
          notes?: string | null
          order_id?: string | null
          phone: string
          status?: string
          store_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          fabric_source?: string
          id?: string
          item_id?: string | null
          measurement_choice?: string
          notes?: string | null
          order_id?: string | null
          phone?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sew_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "storefront_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sew_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_balances"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sew_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sew_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_for_tailor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sew_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sew_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      store_invites: {
        Row: {
          accepted_by: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          phone: string | null
          role: Database["public"]["Enums"]["store_role"]
          status: string
          store_id: string
          token: string
        }
        Insert: {
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["store_role"]
          status?: string
          store_id: string
          token?: string
        }
        Update: {
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["store_role"]
          status?: string
          store_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_invites_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_invites_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          id: string
          invited_phone: string | null
          role: Database["public"]["Enums"]["store_role"]
          status: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_phone?: string | null
          role?: Database["public"]["Enums"]["store_role"]
          status?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_phone?: string | null
          role?: Database["public"]["Enums"]["store_role"]
          status?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          email: string | null
          phone: string | null
          public_location: string | null
          receipt_footer: string | null
          registered_address: string | null
          store_id: string
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          email?: string | null
          phone?: string | null
          public_location?: string | null
          receipt_footer?: string | null
          registered_address?: string | null
          store_id: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          email?: string | null
          phone?: string | null
          public_location?: string | null
          receipt_footer?: string | null
          registered_address?: string | null
          store_id?: string
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_ready_made: boolean
          photos: string[]
          price_max: number | null
          price_min: number | null
          published: boolean
          sizes_stock: Json
          sort_order: number
          store_id: string
          title: string
          turnaround_days: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_ready_made?: boolean
          photos?: string[]
          price_max?: number | null
          price_min?: number | null
          published?: boolean
          sizes_stock?: Json
          sort_order?: number
          store_id: string
          title: string
          turnaround_days?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_ready_made?: boolean
          photos?: string[]
          price_max?: number | null
          price_min?: number | null
          published?: boolean
          sizes_stock?: Json
          sort_order?: number
          store_id?: string
          title?: string
          turnaround_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accent_color: string | null
          bio: string | null
          city: string | null
          country_code: string
          cover_url: string | null
          created_at: string
          currency: string
          garment_types: string[] | null
          id: string
          is_active: boolean
          legal_line: string | null
          logo_url: string | null
          name: string
          onboarding_completed: boolean
          opening_hours: string | null
          owner_id: string
          plan_code: string
          sews_for: string | null
          slug: string
          timezone: string
          trial_ends_at: string
          unit: Database["public"]["Enums"]["measurement_unit"]
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          accent_color?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          garment_types?: string[] | null
          id?: string
          is_active?: boolean
          legal_line?: string | null
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean
          opening_hours?: string | null
          owner_id: string
          plan_code?: string
          sews_for?: string | null
          slug: string
          timezone?: string
          trial_ends_at?: string
          unit?: Database["public"]["Enums"]["measurement_unit"]
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          accent_color?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          garment_types?: string[] | null
          id?: string
          is_active?: boolean
          legal_line?: string | null
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean
          opening_hours?: string | null
          owner_id?: string
          plan_code?: string
          sews_for?: string | null
          slug?: string
          timezone?: string
          trial_ends_at?: string
          unit?: Database["public"]["Enums"]["measurement_unit"]
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_configs"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stores_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      support_grants: {
        Row: {
          admin_id: string | null
          created_at: string
          expires_at: string
          granted_by: string
          id: string
          revoked_at: string | null
          store_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          expires_at: string
          granted_by: string
          id?: string
          revoked_at?: string | null
          store_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          expires_at?: string
          granted_by?: string
          id?: string
          revoked_at?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_grants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_grants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          ai_previews: number
          ai_scans: number
          messages: number
          month: string
          orders: number
          store_id: string
          voice_orders: number
        }
        Insert: {
          ai_previews?: number
          ai_scans?: number
          messages?: number
          month: string
          orders?: number
          store_id: string
          voice_orders?: number
        }
        Update: {
          ai_previews?: number
          ai_scans?: number
          messages?: number
          month?: string
          orders?: number
          store_id?: string
          voice_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      order_balances: {
        Row: {
          balance: number | null
          order_id: string | null
          paid: number | null
          store_id: string | null
          total: number | null
        }
        Insert: {
          balance?: never
          order_id?: string | null
          paid?: never
          store_id?: string | null
          total?: never
        }
        Update: {
          balance?: never
          order_id?: string | null
          paid?: never
          store_id?: string | null
          total?: never
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_for_tailor: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          collected_at: string | null
          created_at: string | null
          created_by: string | null
          delivery_date: string | null
          garment_type: string | null
          id: string | null
          measurement_set_id: string | null
          number: string | null
          priority: string | null
          quantity: number | null
          ready_at: string | null
          status: string | null
          store_id: string | null
          style_notes: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          collected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          garment_type?: string | null
          id?: string | null
          measurement_set_id?: string | null
          number?: string | null
          priority?: string | null
          quantity?: number | null
          ready_at?: string | null
          status?: string | null
          store_id?: string | null
          style_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          collected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          garment_type?: string | null
          id?: string | null
          measurement_set_id?: string | null
          number?: string | null
          priority?: string | null
          quantity?: number | null
          ready_at?: string | null
          status?: string | null
          store_id?: string | null
          style_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_measurement_set_id_fkey"
            columns: ["measurement_set_id"]
            isOneToOne: false
            referencedRelation: "measurement_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stores_public: {
        Row: {
          accent_color: string | null
          bio: string | null
          city: string | null
          cover_url: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          opening_hours: string | null
          slug: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          accent_color?: string | null
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          opening_hours?: string | null
          slug?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          accent_color?: string | null
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          opening_hours?: string | null
          slug?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      admin_list_stores: { Args: never; Returns: Json }
      admin_platform_stats: { Args: never; Returns: Json }
      can_use_feature: {
        Args: { _feature: string; _store_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_key: string
          p_max_count: number
          p_window_minutes: number
        }
        Returns: boolean
      }
      effective_plan_code: { Args: { _store_id: string }; Returns: string }
      feature_usage: {
        Args: { p_feature: string; p_store_id: string }
        Returns: Json
      }
      get_design_by_token: {
        Args: { p_token: string }
        Returns: {
          client_name: string
          created_at: string
          description: string
          id: string
          image_url: string
          measurements: Json
          selfie_url: string
          store_name: string
        }[]
      }
      get_invite_by_token: { Args: { p_token: string }; Returns: Json }
      get_participant_by_token: { Args: { p_token: string }; Returns: Json }
      has_active_support_grant: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      has_store_role: {
        Args: {
          _roles: Database["public"]["Enums"]["store_role"][]
          _store_id: string
        }
        Returns: boolean
      }
      increment_usage_counter: {
        Args: { p_column: string; p_store_id: string }
        Returns: undefined
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_store_member: { Args: { _store_id: string }; Returns: boolean }
      jt_field: {
        Args: {
          p_key: string
          p_label: string
          p_max: number
          p_min: number
          p_ord: number
        }
        Returns: Json
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id: string
          p_metadata?: Json
          p_store_id: string
        }
        Returns: undefined
      }
      set_participant_measurement_choice: {
        Args: { p_choice: string; p_token: string }
        Returns: undefined
      }
      set_participant_style: {
        Args: { p_style_key: string; p_token: string }
        Returns: undefined
      }
    }
    Enums: {
      measurement_unit: "in" | "cm"
      store_role: "owner" | "manager" | "tailor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      measurement_unit: ["in", "cm"],
      store_role: ["owner", "manager", "tailor"],
    },
  },
} as const
