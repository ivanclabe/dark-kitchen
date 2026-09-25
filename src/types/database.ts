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
      dk_ai_insights: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          feature_key: string
          id: string
          input: Json
          kitchen_id: string
          model: string | null
          output: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          feature_key: string
          id?: string
          input: Json
          kitchen_id?: string
          model?: string | null
          output?: Json | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          feature_key?: string
          id?: string
          input?: Json
          kitchen_id?: string
          model?: string | null
          output?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ai_insights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_ai_insights_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "dk_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_ai_insights_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id: string
          kitchen_id: string
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          kitchen_id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          kitchen_id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_attachments_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          kitchen_id: string | null
          new_data: Json | null
          old_data: Json | null
          organization_id: string | null
          record_id: string | null
          record_key: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kitchen_id?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          record_key?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kitchen_id?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          record_id?: string | null
          record_key?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_audit_log_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_customers: {
        Row: {
          address: string | null
          created_at: string
          full_name: string
          id: string
          kitchen_id: string
          notes: string | null
          phone: string | null
          updated_at: string
          whatsapp_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          full_name: string
          id?: string
          kitchen_id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          kitchen_id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_customers_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_daily_availability: {
        Row: {
          available: boolean
          created_at: string
          created_by: string | null
          id: string
          kitchen_id: string
          menu_date: string
          menu_item_id: string
          special_price: number | null
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          menu_date: string
          menu_item_id: string
          special_price?: number | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          menu_date?: string
          menu_item_id?: string
          special_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_daily_availability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_daily_availability_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_daily_availability_menu_item_id_fkey"
            columns: ["kitchen_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "dk_menu_items"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          dispatched_at: string
          id: string
          kitchen_id: string
          notes: string | null
          order_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["dk_delivery_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string
          id?: string
          kitchen_id?: string
          notes?: string | null
          order_id: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["dk_delivery_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string
          id?: string
          kitchen_id?: string
          notes?: string | null
          order_id?: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["dk_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_deliveries_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_deliveries_order_id_fkey"
            columns: ["kitchen_id", "order_id"]
            isOneToOne: false
            referencedRelation: "dk_orders"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_deliveries_rider_id_fkey"
            columns: ["kitchen_id", "rider_id"]
            isOneToOne: false
            referencedRelation: "dk_delivery_riders"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_delivery_riders: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          kitchen_id: string
          phone: string | null
          updated_at: string
          user_id: string | null
          vehicle_type: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          kitchen_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_type?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          kitchen_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_delivery_riders_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_delivery_riders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_features: {
        Row: {
          active: boolean
          category: string
          default_available: boolean
          default_enabled: boolean
          default_settings: Json
          description: string
          key: string
          label: string
          manage_permission: string
          sort_order: number
          use_permission: string
          uses_model: boolean
        }
        Insert: {
          active?: boolean
          category: string
          default_available?: boolean
          default_enabled?: boolean
          default_settings?: Json
          description: string
          key: string
          label: string
          manage_permission: string
          sort_order: number
          use_permission: string
          uses_model?: boolean
        }
        Update: {
          active?: boolean
          category?: string
          default_available?: boolean
          default_enabled?: boolean
          default_settings?: Json
          description?: string
          key?: string
          label?: string
          manage_permission?: string
          sort_order?: number
          use_permission?: string
          uses_model?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dk_features_manage_permission_fkey"
            columns: ["manage_permission"]
            isOneToOne: false
            referencedRelation: "dk_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_features_use_permission_fkey"
            columns: ["use_permission"]
            isOneToOne: false
            referencedRelation: "dk_permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      dk_ingredient_categories: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredient_categories_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_ingredient_purchase_units: {
        Row: {
          created_at: string
          factor_to_base: number
          id: string
          ingredient_id: string
          kitchen_id: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          factor_to_base: number
          id?: string
          ingredient_id: string
          kitchen_id?: string
          unit_id: string
        }
        Update: {
          created_at?: string
          factor_to_base?: number
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredient_purchase_units_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_ingredient_purchase_units_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_ingredient_purchase_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "dk_units"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_ingredient_stock: {
        Row: {
          ingredient_id: string
          kitchen_id: string
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
          updated_at: string
        }
        Insert: {
          ingredient_id: string
          kitchen_id?: string
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
          updated_at?: string
        }
        Update: {
          ingredient_id?: string
          kitchen_id?: string
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredient_stock_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_ingredient_stock_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_ingredients: {
        Row: {
          active: boolean
          avg_cost: number
          base_unit_id: string
          category_id: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          kitchen_id: string
          max_stock: number | null
          min_stock: number
          name: string
          perishable: boolean
          primary_supplier_id: string | null
          shelf_life_days: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avg_cost?: number
          base_unit_id: string
          category_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          kitchen_id?: string
          max_stock?: number | null
          min_stock?: number
          name: string
          perishable?: boolean
          primary_supplier_id?: string | null
          shelf_life_days?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avg_cost?: number
          base_unit_id?: string
          category_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          kitchen_id?: string
          max_stock?: number | null
          min_stock?: number
          name?: string
          perishable?: boolean
          primary_supplier_id?: string | null
          shelf_life_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredients_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "dk_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_ingredients_category_id_fkey"
            columns: ["kitchen_id", "category_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredient_categories"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_ingredients_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_ingredients_primary_supplier_id_fkey"
            columns: ["kitchen_id", "primary_supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          kitchen_id: string
          movement_type: Database["public"]["Enums"]["dk_movement_type"]
          observation: string | null
          quantity_base_unit: number
          reason: Database["public"]["Enums"]["dk_waste_reason"] | null
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          kitchen_id?: string
          movement_type: Database["public"]["Enums"]["dk_movement_type"]
          observation?: string | null
          quantity_base_unit: number
          reason?: Database["public"]["Enums"]["dk_waste_reason"] | null
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          movement_type?: Database["public"]["Enums"]["dk_movement_type"]
          observation?: string | null
          quantity_base_unit?: number
          reason?: Database["public"]["Enums"]["dk_waste_reason"] | null
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_inventory_movements_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_inventory_movements_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_inventory_reservations: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: string
          order_item_id: string
          quantity_base_unit: number
          resolved_at: string | null
          status: Database["public"]["Enums"]["dk_reservation_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id?: string
          order_item_id: string
          quantity_base_unit: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dk_reservation_status"]
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          order_item_id?: string
          quantity_base_unit?: number
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dk_reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dk_inventory_reservations_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_inventory_reservations_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_inventory_reservations_order_item_id_fkey"
            columns: ["kitchen_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "dk_order_items"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_kitchen_counters: {
        Row: {
          kitchen_id: string
          last_value: number
          name: string
        }
        Insert: {
          kitchen_id: string
          last_value: number
          name: string
        }
        Update: {
          kitchen_id?: string
          last_value?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_counters_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_features: {
        Row: {
          enabled: boolean
          feature_key: string
          kitchen_id: string
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          kitchen_id?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          kitchen_id?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "dk_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_kitchen_features_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_features_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_hour_exceptions: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by: string | null
          exception_date: string
          is_open: boolean
          kitchen_id: string
          note: string | null
          opens_at: string | null
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          exception_date: string
          is_open: boolean
          kitchen_id?: string
          note?: string | null
          opens_at?: string | null
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          exception_date?: string
          is_open?: boolean
          kitchen_id?: string
          note?: string | null
          opens_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_hour_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_hour_exceptions_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_hours: {
        Row: {
          closes_at: string | null
          day_of_week: Database["public"]["Enums"]["dk_day_of_week"]
          is_open: boolean
          kitchen_id: string
          opens_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closes_at?: string | null
          day_of_week: Database["public"]["Enums"]["dk_day_of_week"]
          is_open?: boolean
          kitchen_id?: string
          opens_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closes_at?: string | null
          day_of_week?: Database["public"]["Enums"]["dk_day_of_week"]
          is_open?: boolean
          kitchen_id?: string
          opens_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_hours_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_hours_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_members: {
        Row: {
          active: boolean
          created_at: string
          default_role_id: string
          invited_by: string | null
          kitchen_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_role_id: string
          invited_by?: string | null
          kitchen_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_role_id?: string
          invited_by?: string | null
          kitchen_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_members_default_role_id_fkey"
            columns: ["default_role_id"]
            isOneToOne: false
            referencedRelation: "dk_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_members_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_sla_settings: {
        Row: {
          confirmado_alert_min: number
          en_preparacion_alert_min: number
          id: number | null
          kitchen_id: string
          listo_alert_min: number
          near_threshold_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmado_alert_min?: number
          en_preparacion_alert_min?: number
          id?: number | null
          kitchen_id?: string
          listo_alert_min?: number
          near_threshold_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmado_alert_min?: number
          en_preparacion_alert_min?: number
          id?: number | null
          kitchen_id?: string
          listo_alert_min?: number
          near_threshold_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_sla_settings_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: true
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_sla_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_kitchen_tickets: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          order_id: string
          priority: number
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: string
          order_id: string
          priority?: number
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          order_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_tickets_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_tickets_order_id_fkey"
            columns: ["kitchen_id", "order_id"]
            isOneToOne: false
            referencedRelation: "dk_orders"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_kitchens: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          icon_key: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          organization_id: string
          phone: string | null
          slug: string
          tax_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          icon_key?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          organization_id: string
          phone?: string | null
          slug: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          icon_key?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          slug?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_master_menu_kitchens: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          kitchen_id: string
          master_menu_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          kitchen_id: string
          master_menu_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          kitchen_id?: string
          master_menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_master_menu_kitchens_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_master_menu_kitchens_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_master_menu_kitchens_master_menu_id_fkey"
            columns: ["master_menu_id"]
            isOneToOne: false
            referencedRelation: "dk_master_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_master_menus: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_master_menus_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_master_menus_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_master_products: {
        Row: {
          active: boolean
          category_name: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          master_menu_id: string
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_name?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          master_menu_id: string
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_name?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          master_menu_id?: string
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_master_products_master_menu_id_fkey"
            columns: ["master_menu_id"]
            isOneToOne: false
            referencedRelation: "dk_master_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_master_recipe_items: {
        Row: {
          id: string
          ingredient_code: string
          ingredient_name: string
          master_product_id: string
          quantity: number
          unit_code: string
        }
        Insert: {
          id?: string
          ingredient_code: string
          ingredient_name: string
          master_product_id: string
          quantity: number
          unit_code: string
        }
        Update: {
          id?: string
          ingredient_code?: string
          ingredient_name?: string
          master_product_id?: string
          quantity?: number
          unit_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_master_recipe_items_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "dk_master_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_master_recipe_items_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "dk_supply_suggestions"
            referencedColumns: ["base_unit_code"]
          },
          {
            foreignKeyName: "dk_master_recipe_items_unit_code_fkey"
            columns: ["unit_code"]
            isOneToOne: false
            referencedRelation: "dk_units"
            referencedColumns: ["code"]
          },
        ]
      }
      dk_member_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          kitchen_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          kitchen_id: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          kitchen_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_member_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_member_roles_kitchen_id_user_id_fkey"
            columns: ["kitchen_id", "user_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchen_members"
            referencedColumns: ["kitchen_id", "user_id"]
          },
          {
            foreignKeyName: "dk_member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "dk_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_menu_items: {
        Row: {
          active: boolean
          created_at: string
          end_time: string | null
          id: string
          kitchen_id: string
          menu_id: string
          product_id: string
          special_price: number | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_time?: string | null
          id?: string
          kitchen_id?: string
          menu_id: string
          product_id: string
          special_price?: number | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_time?: string | null
          id?: string
          kitchen_id?: string
          menu_id?: string
          product_id?: string
          special_price?: number | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_menu_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_menu_items_menu_id_fkey"
            columns: ["kitchen_id", "menu_id"]
            isOneToOne: false
            referencedRelation: "dk_menus"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_menu_items_product_id_fkey"
            columns: ["kitchen_id", "product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_menu_plan_items: {
        Row: {
          created_at: string
          created_by: string | null
          display_order: number
          end_time: string | null
          id: string
          is_active: boolean
          kitchen_id: string
          plan_date: string
          product_id: string
          special_price: number | null
          start_time: string | null
          unit_limit: number | null
          updated_at: string
          while_supplies_last: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          kitchen_id?: string
          plan_date: string
          product_id: string
          special_price?: number | null
          start_time?: string | null
          unit_limit?: number | null
          updated_at?: string
          while_supplies_last?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          kitchen_id?: string
          plan_date?: string
          product_id?: string
          special_price?: number | null
          start_time?: string | null
          unit_limit?: number | null
          updated_at?: string
          while_supplies_last?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dk_menu_plan_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_menu_plan_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_menu_plan_items_product_id_fkey"
            columns: ["kitchen_id", "product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_menus: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          kitchen_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kitchen_id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kitchen_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_menus_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_order_items: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          kitchen_status: Database["public"]["Enums"]["dk_kitchen_item_status"]
          kitchen_status_changed_at: string
          line_total: number | null
          observation: string | null
          order_id: string
          product_id: string
          quantity: number
          recipe_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: string
          kitchen_status?: Database["public"]["Enums"]["dk_kitchen_item_status"]
          kitchen_status_changed_at?: string
          line_total?: number | null
          observation?: string | null
          order_id: string
          product_id: string
          quantity: number
          recipe_id?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          kitchen_status?: Database["public"]["Enums"]["dk_kitchen_item_status"]
          kitchen_status_changed_at?: string
          line_total?: number | null
          observation?: string | null
          order_id?: string
          product_id?: string
          quantity?: number
          recipe_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "dk_order_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_order_items_order_id_fkey"
            columns: ["kitchen_id", "order_id"]
            isOneToOne: false
            referencedRelation: "dk_orders"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_order_items_product_id_fkey"
            columns: ["kitchen_id", "product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_order_items_recipe_id_fkey"
            columns: ["kitchen_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "dk_recipes"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_order_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          kitchen_id: string
          method: string | null
          note: string | null
          order_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          method?: string | null
          note?: string | null
          order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          method?: string | null
          note?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_order_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_order_payments_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_order_payments_order_id_fkey"
            columns: ["kitchen_id", "order_id"]
            isOneToOne: false
            referencedRelation: "dk_orders"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["dk_order_status"] | null
          id: string
          kitchen_id: string
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["dk_order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["dk_order_status"] | null
          id?: string
          kitchen_id?: string
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["dk_order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["dk_order_status"] | null
          id?: string
          kitchen_id?: string
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["dk_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dk_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_order_status_history_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_order_status_history_order_id_fkey"
            columns: ["kitchen_id", "order_id"]
            isOneToOne: false
            referencedRelation: "dk_orders"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_orders: {
        Row: {
          channel: Database["public"]["Enums"]["dk_order_channel"]
          created_at: string
          created_by: string | null
          customer_id: string
          delivery_fee: number
          discount: number
          due_date: string | null
          external_reference: string | null
          id: string
          kitchen_id: string
          notes: string | null
          order_number: number
          payment_method: string | null
          requires_review: boolean
          status: Database["public"]["Enums"]["dk_order_status"]
          subtotal: number
          total: number | null
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["dk_order_channel"]
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          external_reference?: string | null
          id?: string
          kitchen_id?: string
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          requires_review?: boolean
          status?: Database["public"]["Enums"]["dk_order_status"]
          subtotal?: number
          total?: number | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["dk_order_channel"]
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          external_reference?: string | null
          id?: string
          kitchen_id?: string
          notes?: string | null
          order_number?: number
          payment_method?: string | null
          requires_review?: boolean
          status?: Database["public"]["Enums"]["dk_order_status"]
          subtotal?: number
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_orders_customer_id_fkey"
            columns: ["kitchen_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "dk_customers"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_orders_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_organization_features: {
        Row: {
          available: boolean
          feature_key: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available: boolean
          feature_key: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available?: boolean
          feature_key?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_organization_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "dk_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_organization_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_organization_features_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_organization_members: {
        Row: {
          created_at: string
          created_by: string | null
          is_super_admin: boolean
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_super_admin?: boolean
          organization_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_super_admin?: boolean
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_organization_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_organizations: {
        Row: {
          active: boolean
          address: string | null
          category: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          default_timezone: string
          id: string
          legal_name: string | null
          max_accounts: number | null
          name: string
          owner_user_id: string
          phone: string | null
          sector: string | null
          slug: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_timezone?: string
          id?: string
          legal_name?: string | null
          max_accounts?: number | null
          name: string
          owner_user_id: string
          phone?: string | null
          sector?: string | null
          slug: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_timezone?: string
          id?: string
          legal_name?: string | null
          max_accounts?: number | null
          name?: string
          owner_user_id?: string
          phone?: string | null
          sector?: string | null
          slug?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_organizations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: true
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_permissions: {
        Row: {
          action: string
          description: string | null
          key: string
          label: string
          module: string
          scope: string
          sort_order: number
        }
        Insert: {
          action: string
          description?: string | null
          key: string
          label: string
          module: string
          scope: string
          sort_order: number
        }
        Update: {
          action?: string
          description?: string | null
          key?: string
          label?: string
          module?: string
          scope?: string
          sort_order?: number
        }
        Relationships: []
      }
      dk_product_categories: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_product_categories_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_products: {
        Row: {
          active: boolean
          active_recipe_id: string | null
          category_id: string | null
          code: string | null
          created_at: string
          description: string | null
          estimated_cost: number
          id: string
          image_path: string | null
          kitchen_id: string
          master_product_id: string | null
          name: string
          price: number
          price_is_local: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_recipe_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number
          id?: string
          image_path?: string | null
          kitchen_id?: string
          master_product_id?: string | null
          name: string
          price?: number
          price_is_local?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_recipe_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number
          id?: string
          image_path?: string | null
          kitchen_id?: string
          master_product_id?: string | null
          name?: string
          price?: number
          price_is_local?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_products_active_recipe_fkey"
            columns: ["kitchen_id", "active_recipe_id"]
            isOneToOne: false
            referencedRelation: "dk_recipes"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_products_category_id_fkey"
            columns: ["kitchen_id", "category_id"]
            isOneToOne: false
            referencedRelation: "dk_product_categories"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_products_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_products_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "dk_master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_purchase_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: string
          line_total: number | null
          purchase_id: string
          purchase_unit_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id?: string
          line_total?: number | null
          purchase_id: string
          purchase_unit_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          line_total?: number | null
          purchase_id?: string
          purchase_unit_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "dk_purchase_items_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_purchase_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_purchase_items_purchase_id_fkey"
            columns: ["kitchen_id", "purchase_id"]
            isOneToOne: false
            referencedRelation: "dk_purchases"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_purchase_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "dk_units"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string
          invoice_number: string
          kitchen_id: string
          notes: string | null
          status: Database["public"]["Enums"]["dk_purchase_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          kitchen_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["dk_purchase_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          kitchen_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["dk_purchase_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_purchases_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_purchases_supplier_id_fkey"
            columns: ["kitchen_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: string
          quantity: number
          recipe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id?: string
          quantity: number
          recipe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          quantity?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_recipe_items_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_recipe_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_recipe_items_recipe_id_fkey"
            columns: ["kitchen_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "dk_recipes"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_recipes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kitchen_id: string
          product_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kitchen_id?: string
          product_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kitchen_id?: string
          product_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dk_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_recipes_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_recipes_product_id_fkey"
            columns: ["kitchen_id", "product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "dk_permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_role_permissions_role_id_fkey_v2"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "dk_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_supplier_ingredients: {
        Row: {
          agreed_cost: number | null
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: string
          supplier_id: string
        }
        Insert: {
          agreed_cost?: number | null
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id?: string
          supplier_id: string
        }
        Update: {
          agreed_cost?: number | null
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_supplier_ingredients_ingredient_id_fkey"
            columns: ["kitchen_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["kitchen_id", "id"]
          },
          {
            foreignKeyName: "dk_supplier_ingredients_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_supplier_ingredients_supplier_id_fkey"
            columns: ["kitchen_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
      dk_suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          kitchen_id: string
          name: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kitchen_id?: string
          name: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kitchen_id?: string
          name?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_suppliers_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_units: {
        Row: {
          code: string
          created_at: string
          factor_to_base: number
          id: string
          name: string
          unit_type: Database["public"]["Enums"]["dk_unit_type"]
        }
        Insert: {
          code: string
          created_at?: string
          factor_to_base?: number
          id?: string
          name: string
          unit_type: Database["public"]["Enums"]["dk_unit_type"]
        }
        Update: {
          code?: string
          created_at?: string
          factor_to_base?: number
          id?: string
          name?: string
          unit_type?: Database["public"]["Enums"]["dk_unit_type"]
        }
        Relationships: []
      }
      dk_user_activations: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          revoked_at: string | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id: string
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_user_activations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_user_activations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dk_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_user_activations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_users: {
        Row: {
          active: boolean
          auth_user_id: string | null
          avatar_key: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_account_id: string | null
          platform_role: string | null
          role: Database["public"]["Enums"]["dk_role"] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          avatar_key?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_account_id?: string | null
          platform_role?: string | null
          role?: Database["public"]["Enums"]["dk_role"] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          avatar_key?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_account_id?: string | null
          platform_role?: string | null
          role?: Database["public"]["Enums"]["dk_role"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_users_last_account_id_fkey"
            columns: ["last_account_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_weekly_menu_items: {
        Row: {
          created_at: string
          day_of_week: Database["public"]["Enums"]["dk_day_of_week"]
          display_order: number
          id: string
          is_active: boolean
          kitchen_id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: Database["public"]["Enums"]["dk_day_of_week"]
          display_order?: number
          id?: string
          is_active?: boolean
          kitchen_id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: Database["public"]["Enums"]["dk_day_of_week"]
          display_order?: number
          id?: string
          is_active?: boolean
          kitchen_id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_weekly_menu_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_weekly_menu_items_product_id_fkey"
            columns: ["kitchen_id", "product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["kitchen_id", "id"]
          },
        ]
      }
    }
    Views: {
      dk_ai_features: {
        Row: {
          enabled: boolean | null
          feature_key: string | null
          kitchen_id: string | null
          settings: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dk_kitchen_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "dk_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "dk_kitchen_features_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "dk_kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_kitchen_features_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "dk_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_receivables: {
        Row: {
          balance: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          order_id: string | null
          order_number: number | null
          paid_amount: number | null
          status: Database["public"]["Enums"]["dk_order_status"] | null
          total: number | null
        }
        Relationships: []
      }
      dk_supply_suggestions: {
        Row: {
          avg_cost: number | null
          base_unit_code: string | null
          below_min: boolean | null
          code: string | null
          consumed_30d: number | null
          coverage_days: number | null
          daily_burn: number | null
          ingredient_id: string | null
          max_stock: number | null
          min_stock: number | null
          name: string | null
          primary_supplier_id: string | null
          stock_available: number | null
          suggested_quantity: number | null
          supplier_name: string | null
          wasted_30d: number | null
        }
        Relationships: []
      }
      dk_today_menu: {
        Row: {
          available: boolean | null
          category: string | null
          description: string | null
          display_order: number | null
          price: number | null
          product: string | null
          product_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      dk_accept_activation: { Args: { p_token: string }; Returns: string }
      dk_activation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          full_name: string
          has_user: boolean
          organization_name: string
          status: string
        }[]
      }
      dk_active_role: { Args: never; Returns: string }
      dk_admin_kitchens: {
        Args: never
        Returns: {
          active: boolean
          admins: number
          created_at: string
          kitchen_id: string
          last_order_at: string
          members_active: number
          name: string
          orders_30d: number
          organization_id: string
          organization_name: string
          slug: string
        }[]
      }
      dk_advance_kitchen_item: {
        Args: { p_order_item_id: string }
        Returns: undefined
      }
      dk_assert_in_active_kitchen: {
        Args: { p_id: string; p_table: string }
        Returns: undefined
      }
      dk_assign_master_menu: {
        Args: { p_kitchen_ids: string[]; p_menu_id: string }
        Returns: number
      }
      dk_calculate_recipe_cost: {
        Args: { p_recipe_id: string }
        Returns: number
      }
      dk_can: { Args: { p_permission: string }; Returns: boolean }
      dk_can_manage_org_user: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: boolean
      }
      dk_can_see_user: { Args: { p_user_id: string }; Returns: boolean }
      dk_can_use_feature: { Args: { p_key: string }; Returns: boolean }
      dk_cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      dk_confirm_order: { Args: { p_order_id: string }; Returns: undefined }
      dk_confirm_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      dk_copy_menu_plan_range: {
        Args: { p_days?: number; p_from_date: string; p_to_date: string }
        Returns: undefined
      }
      dk_copy_weekly_menu_day: {
        Args: {
          p_from_day: Database["public"]["Enums"]["dk_day_of_week"]
          p_to_day: Database["public"]["Enums"]["dk_day_of_week"]
        }
        Returns: undefined
      }
      dk_create_conversational_order: {
        Args: {
          p_channel?: Database["public"]["Enums"]["dk_order_channel"]
          p_customer_name?: string
          p_external_reference?: string
          p_items?: Json
          p_notes?: string
          p_phone: string
        }
        Returns: string
      }
      dk_create_kitchen: {
        Args: {
          p_currency?: string
          p_icon_key?: string
          p_name: string
          p_organization_id?: string
          p_slug: string
          p_timezone?: string
        }
        Returns: string
      }
      dk_create_organization: {
        Args: {
          p_address?: string
          p_category: string
          p_city?: string
          p_country?: string
          p_full_name?: string
          p_legal_name?: string
          p_name: string
          p_phone?: string
          p_sector: string
          p_tax_id?: string
        }
        Returns: string
      }
      dk_create_recipe_version: {
        Args: { p_items: Json; p_product_id: string }
        Returns: string
      }
      dk_create_user: {
        Args: {
          p_assignments?: Json
          p_email: string
          p_full_name: string
          p_organization_id: string
        }
        Returns: Json
      }
      dk_current_kitchen_id: { Args: never; Returns: string }
      dk_current_profile_id: { Args: never; Returns: string }
      dk_dashboard_summary: { Args: never; Returns: Json }
      dk_default_organization_id: { Args: never; Returns: string }
      dk_delete_master_menu: { Args: { p_menu_id: string }; Returns: undefined }
      dk_delete_role: { Args: { p_role_id: string }; Returns: undefined }
      dk_detach_master_copies: {
        Args: { p_kitchen_id?: string; p_master_product_ids: string[] }
        Returns: undefined
      }
      dk_dispatch_order: {
        Args: { p_notes?: string; p_order_id: string; p_rider_id: string }
        Returns: undefined
      }
      dk_effective_role: { Args: { p_kitchen_id: string }; Returns: string }
      dk_feature_available: {
        Args: { p_key: string; p_organization_id: string }
        Returns: boolean
      }
      dk_feature_enabled: {
        Args: { p_key: string; p_kitchen_id: string }
        Returns: boolean
      }
      dk_feature_state: { Args: { p_key: string }; Returns: Json }
      dk_find_or_create_customer_by_phone: {
        Args: { p_full_name?: string; p_phone: string }
        Returns: string
      }
      dk_has_any_profile: { Args: never; Returns: boolean }
      dk_has_kitchen_permission: {
        Args: { p_kitchen_id: string; p_permission: string }
        Returns: boolean
      }
      dk_has_org_permission: {
        Args: { p_organization_id: string; p_permission: string }
        Returns: boolean
      }
      dk_hash_token: { Args: { p_token: string }; Returns: string }
      dk_inventory_signals: {
        Args: {
          p_coverage_days?: number
          p_overstock_days?: number
          p_slow_days?: number
          p_warning_days?: number
        }
        Returns: {
          avg_cost: number
          base_unit_code: string
          below_min: boolean
          code: string
          consumed_30d: number
          consumed_7d: number
          coverage_days: number
          daily_burn: number
          daily_burn_7d: number
          days_since_consumption: number
          est_days_to_expiry: number
          ingredient_id: string
          last_consumed_at: string
          max_stock: number
          min_stock: number
          name: string
          needs_reorder: boolean
          oldest_stock_at: string
          oldest_stock_qty: number
          overstock: boolean
          perishable: boolean
          perishable_risk: boolean
          primary_supplier_id: string
          projected_waste_qty: number
          shelf_life_days: number
          slow_mover: boolean
          stock_available: number
          stock_on_hand: number
          stock_value: number
          suggested_quantity: number
          supplier_name: string
          wasted_30d: number
        }[]
      }
      dk_is_kitchen_member: { Args: { p_kitchen_id: string }; Returns: boolean }
      dk_is_org_super_admin: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      dk_is_staff: { Args: never; Returns: boolean }
      dk_is_superadmin: { Args: never; Returns: boolean }
      dk_is_syncing_master: { Args: never; Returns: boolean }
      dk_kitchen_signals: { Args: { p_dish_stall_min?: number }; Returns: Json }
      dk_kitchen_team: {
        Args: never
        Returns: {
          active: boolean
          email: string
          full_name: string
          is_me: boolean
          member_since: string
          role_id: string
          role_is_system: boolean
          role_name: string
          user_id: string
        }[]
      }
      dk_kitchen_today: { Args: never; Returns: string }
      dk_mark_delivered: { Args: { p_order_id: string }; Returns: undefined }
      dk_my_context: { Args: never; Returns: Json }
      dk_my_features: { Args: never; Returns: Json }
      dk_my_kitchens: {
        Args: never
        Returns: {
          active: boolean
          kitchen_id: string
          name: string
          permissions: string[]
          role_key: string
          role_name: string
          slug: string
        }[]
      }
      dk_new_activation: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: string
      }
      dk_next_order_number: { Args: { p_kitchen_id: string }; Returns: number }
      dk_normalize_role_name: { Args: { p_name: string }; Returns: string }
      dk_org_feature_matrix: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      dk_org_users: { Args: { p_organization_id: string }; Returns: Json }
      dk_register_adjustment: {
        Args: {
          p_ingredient_id: string
          p_observation?: string
          p_quantity: number
        }
        Returns: string
      }
      dk_register_payment: {
        Args: {
          p_amount: number
          p_method?: string
          p_note?: string
          p_order_id: string
        }
        Returns: string
      }
      dk_register_waste: {
        Args: {
          p_ingredient_id: string
          p_observation?: string
          p_quantity: number
          p_reason: Database["public"]["Enums"]["dk_waste_reason"]
        }
        Returns: string
      }
      dk_remove_org_member: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      dk_report_profitability: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cogs: number
          gross_margin: number
          revenue: number
        }[]
      }
      dk_report_purchases_by_supplier: {
        Args: { p_from: string; p_to: string }
        Returns: {
          purchase_count: number
          supplier_id: string
          supplier_name: string
          total: number
        }[]
      }
      dk_report_sales_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          order_count: number
          total: number
        }[]
      }
      dk_report_top_ingredients_purchased: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ingredient_id: string
          ingredient_name: string
          quantity: number
          total_cost: number
        }[]
      }
      dk_report_top_products: {
        Args: { p_from: string; p_to: string }
        Returns: {
          estimated_cost: number
          margin: number
          product_id: string
          product_name: string
          qty_sold: number
          revenue: number
        }[]
      }
      dk_report_waste: {
        Args: { p_from: string; p_to: string }
        Returns: {
          estimated_value: number
          ingredient_id: string
          ingredient_name: string
          quantity: number
        }[]
      }
      dk_request_header: { Args: { p_name: string }; Returns: string }
      dk_require: { Args: { p_permission: string }; Returns: undefined }
      dk_require_master_menu_manager: {
        Args: { p_menu_id: string }
        Returns: undefined
      }
      dk_resend_activation: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: string
      }
      dk_revert_kitchen_item: {
        Args: { p_order_item_id: string }
        Returns: undefined
      }
      dk_save_master_product: {
        Args: {
          p_active: boolean
          p_category: string
          p_code: string
          p_description: string
          p_menu_id: string
          p_name: string
          p_price: number
          p_product_id: string
          p_recipe: Json
        }
        Returns: string
      }
      dk_save_role: {
        Args: {
          p_description: string
          p_name: string
          p_organization_id?: string
          p_permissions: string[]
          p_role_id: string
        }
        Returns: string
      }
      dk_set_kitchen_feature: {
        Args: {
          p_enabled: boolean
          p_key: string
          p_kitchen_id: string
          p_settings?: Json
        }
        Returns: undefined
      }
      dk_set_kitchens_active: {
        Args: { p_active: boolean; p_kitchen_ids: string[] }
        Returns: number
      }
      dk_set_last_account: {
        Args: { p_kitchen_id: string }
        Returns: undefined
      }
      dk_set_member_roles: {
        Args: {
          p_default_role_id: string
          p_kitchen_id: string
          p_role_ids: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      dk_set_org_feature: {
        Args: { p_available: boolean; p_key: string; p_organization_id: string }
        Returns: undefined
      }
      dk_set_org_member: {
        Args: {
          p_active: boolean
          p_organization_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      dk_set_ticket_priority: {
        Args: { p_order_id: string; p_priority: number }
        Returns: undefined
      }
      dk_slugify: {
        Args: { p_fallback?: string; p_text: string }
        Returns: string
      }
      dk_sync_master_menu_kitchen: {
        Args: { p_kitchen_id: string; p_menu_id: string }
        Returns: undefined
      }
      dk_today_day_of_week: {
        Args: never
        Returns: Database["public"]["Enums"]["dk_day_of_week"]
      }
      dk_unassign_master_menu: {
        Args: { p_kitchen_ids: string[]; p_menu_id: string }
        Returns: number
      }
      dk_unique_slug: {
        Args: { p_base: string; p_table: string }
        Returns: string
      }
      dk_update_my_profile: {
        Args: { p_avatar_key: string; p_full_name: string }
        Returns: undefined
      }
      dk_update_pending_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      dk_day_of_week:
        | "LUNES"
        | "MARTES"
        | "MIERCOLES"
        | "JUEVES"
        | "VIERNES"
        | "SABADO"
        | "DOMINGO"
      dk_delivery_status: "EN_RUTA" | "ENTREGADO" | "FALLIDO"
      dk_kitchen_item_status: "PENDIENTE" | "EN_PREPARACION" | "LISTO"
      dk_movement_type: "COMPRA" | "MERMA" | "AJUSTE" | "CONSUMO" | "DEVOLUCION"
      dk_order_channel: "MANUAL" | "WHATSAPP" | "PHONE"
      dk_order_status:
        | "NUEVO"
        | "CONFIRMADO"
        | "EN_PREPARACION"
        | "LISTO"
        | "DESPACHADO"
        | "ENTREGADO"
        | "CANCELADO"
      dk_purchase_status: "BORRADOR" | "CONFIRMADA" | "ANULADA"
      dk_reservation_status: "ACTIVE" | "RELEASED" | "CONSUMED"
      dk_role:
        | "ADMIN"
        | "MANAGER"
        | "KITCHEN"
        | "INVENTORY"
        | "CASHIER"
        | "DELIVERY"
      dk_unit_type: "WEIGHT" | "VOLUME" | "UNIT"
      dk_waste_reason: "VENCIMIENTO" | "DANO" | "ERROR_PREPARACION" | "OTRO"
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
      dk_day_of_week: [
        "LUNES",
        "MARTES",
        "MIERCOLES",
        "JUEVES",
        "VIERNES",
        "SABADO",
        "DOMINGO",
      ],
      dk_delivery_status: ["EN_RUTA", "ENTREGADO", "FALLIDO"],
      dk_kitchen_item_status: ["PENDIENTE", "EN_PREPARACION", "LISTO"],
      dk_movement_type: ["COMPRA", "MERMA", "AJUSTE", "CONSUMO", "DEVOLUCION"],
      dk_order_channel: ["MANUAL", "WHATSAPP", "PHONE"],
      dk_order_status: [
        "NUEVO",
        "CONFIRMADO",
        "EN_PREPARACION",
        "LISTO",
        "DESPACHADO",
        "ENTREGADO",
        "CANCELADO",
      ],
      dk_purchase_status: ["BORRADOR", "CONFIRMADA", "ANULADA"],
      dk_reservation_status: ["ACTIVE", "RELEASED", "CONSUMED"],
      dk_role: [
        "ADMIN",
        "MANAGER",
        "KITCHEN",
        "INVENTORY",
        "CASHIER",
        "DELIVERY",
      ],
      dk_unit_type: ["WEIGHT", "VOLUME", "UNIT"],
      dk_waste_reason: ["VENCIMIENTO", "DANO", "ERROR_PREPARACION", "OTRO"],
    },
  },
} as const
