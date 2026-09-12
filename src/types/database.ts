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
      app_estado_workflow: {
        Row: {
          actualizado_en: string
          clave: string
          valor: string | null
        }
        Insert: {
          actualizado_en?: string
          clave: string
          valor?: string | null
        }
        Update: {
          actualizado_en?: string
          clave?: string
          valor?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          created_at: string
          empresa_pagadora_id: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_pagadora_id?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_pagadora_id?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_pagadora_id_fkey"
            columns: ["empresa_pagadora_id"]
            isOneToOne: false
            referencedRelation: "empresas_pagadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes_pago_conductor: {
        Row: {
          consecutivo: number
          created_at: string
          id: string
          viaje_id: string
        }
        Insert: {
          consecutivo?: number
          created_at?: string
          id?: string
          viaje_id: string
        }
        Update: {
          consecutivo?: number
          created_at?: string
          id?: string
          viaje_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_pago_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: true
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_pago_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: true
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos_obligacion: {
        Row: {
          created_at: string
          id: string
          nombre: string
          vehiculo_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          vehiculo_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conceptos_obligacion_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "conceptos_obligacion_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      conductores: {
        Row: {
          activo: boolean
          cedula: string | null
          created_at: string
          id: string
          licencia_numero: string | null
          licencia_vencimiento: string | null
          nombre: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cedula?: string | null
          created_at?: string
          id?: string
          licencia_numero?: string | null
          licencia_vencimiento?: string | null
          nombre: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cedula?: string | null
          created_at?: string
          id?: string
          licencia_numero?: string | null
          licencia_vencimiento?: string | null
          nombre?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      descuentos_conductor: {
        Row: {
          comentarios: string | null
          created_at: string
          fecha_descuento: string
          id: string
          tipo_descuento: string
          valor: number
          viaje_id: string
        }
        Insert: {
          comentarios?: string | null
          created_at?: string
          fecha_descuento?: string
          id?: string
          tipo_descuento: string
          valor?: number
          viaje_id: string
        }
        Update: {
          comentarios?: string | null
          created_at?: string
          fecha_descuento?: string
          id?: string
          tipo_descuento?: string
          valor?: number
          viaje_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "descuentos_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descuentos_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
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
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
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
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
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
        ]
      }
      dk_daily_availability: {
        Row: {
          available: boolean
          created_at: string
          created_by: string | null
          id: string
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
            foreignKeyName: "dk_daily_availability_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "dk_menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_ingredient_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      dk_ingredient_purchase_units: {
        Row: {
          created_at: string
          factor_to_base: number
          id: string
          ingredient_id: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          factor_to_base: number
          id?: string
          ingredient_id: string
          unit_id: string
        }
        Update: {
          created_at?: string
          factor_to_base?: number
          id?: string
          ingredient_id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredient_purchase_units_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
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
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
          updated_at: string
        }
        Insert: {
          ingredient_id: string
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
          updated_at?: string
        }
        Update: {
          ingredient_id?: string
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_ingredient_stock_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "dk_ingredients"
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
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredient_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_ingredients_primary_supplier_id_fkey"
            columns: ["primary_supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
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
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
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
          menu_id?: string
          product_id?: string
          special_price?: number | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "dk_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_menu_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_menus: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dk_product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
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
          name: string
          price: number
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
          name: string
          price?: number
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
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_products_active_recipe_fkey"
            columns: ["active_recipe_id"]
            isOneToOne: false
            referencedRelation: "dk_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dk_product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_purchase_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
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
          line_total?: number | null
          purchase_id?: string
          purchase_unit_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "dk_purchase_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "dk_purchases"
            referencedColumns: ["id"]
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
            foreignKeyName: "dk_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_recipe_items: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          quantity: number
          recipe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          quantity: number
          recipe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          quantity?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_recipe_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "dk_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      dk_recipes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          product_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
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
            foreignKeyName: "dk_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "dk_products"
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
          supplier_id: string
        }
        Insert: {
          agreed_cost?: number | null
          created_at?: string
          id?: string
          ingredient_id: string
          supplier_id: string
        }
        Update: {
          agreed_cost?: number | null
          created_at?: string
          id?: string
          ingredient_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dk_supplier_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "dk_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dk_supplier_ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "dk_suppliers"
            referencedColumns: ["id"]
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
          name?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      dk_users: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["dk_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          full_name: string
          id?: string
          role?: Database["public"]["Enums"]["dk_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["dk_role"]
          updated_at?: string
        }
        Relationships: []
      }
      documentos_soporte: {
        Row: {
          cancelado_en: string | null
          comentarios: string | null
          conductor_id: string | null
          consecutivo: number
          created_at: string
          empresa_transportadora_id: string | null
          entidad_tipo: string
          estado: string
          fecha: string
          id: string
          motivo_cancelacion: string | null
          tercero_nombre: string | null
          updated_at: string
          vehiculo_id: string | null
          vehiculo_referencia_id: string | null
          viaje_id: string | null
        }
        Insert: {
          cancelado_en?: string | null
          comentarios?: string | null
          conductor_id?: string | null
          consecutivo?: number
          created_at?: string
          empresa_transportadora_id?: string | null
          entidad_tipo?: string
          estado?: string
          fecha?: string
          id?: string
          motivo_cancelacion?: string | null
          tercero_nombre?: string | null
          updated_at?: string
          vehiculo_id?: string | null
          vehiculo_referencia_id?: string | null
          viaje_id?: string | null
        }
        Update: {
          cancelado_en?: string | null
          comentarios?: string | null
          conductor_id?: string | null
          consecutivo?: number
          created_at?: string
          empresa_transportadora_id?: string | null
          entidad_tipo?: string
          estado?: string
          fecha?: string
          id?: string
          motivo_cancelacion?: string | null
          tercero_nombre?: string | null
          updated_at?: string
          vehiculo_id?: string | null
          vehiculo_referencia_id?: string | null
          viaje_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_soporte_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_empresa_transportadora_id_fkey"
            columns: ["empresa_transportadora_id"]
            isOneToOne: false
            referencedRelation: "empresas_pagadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "documentos_soporte_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_vehiculo_referencia_id_fkey"
            columns: ["vehiculo_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "documentos_soporte_vehiculo_referencia_id_fkey"
            columns: ["vehiculo_referencia_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_soporte_detalles: {
        Row: {
          categoria: string
          created_at: string
          documento_id: string
          id: string
          naturaleza: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string
          documento_id: string
          id?: string
          naturaleza?: string | null
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          documento_id?: string
          id?: string
          naturaleza?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_soporte_detalles_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_soporte"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_soporte_grupos: {
        Row: {
          comentarios: string | null
          consecutivo: number
          created_at: string
          id: string
          nombre: string | null
          updated_at: string
        }
        Insert: {
          comentarios?: string | null
          consecutivo?: number
          created_at?: string
          id?: string
          nombre?: string | null
          updated_at?: string
        }
        Update: {
          comentarios?: string | null
          consecutivo?: number
          created_at?: string
          id?: string
          nombre?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documentos_soporte_grupos_items: {
        Row: {
          created_at: string
          documento_id: string
          grupo_id: string
          id: string
        }
        Insert: {
          created_at?: string
          documento_id: string
          grupo_id: string
          id?: string
        }
        Update: {
          created_at?: string
          documento_id?: string
          grupo_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_soporte_grupos_items_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_soporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_grupos_items_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "documentos_soporte_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas_pagadoras: {
        Row: {
          activo: boolean
          created_at: string
          dias_vencimiento_cartera: number
          id: string
          nombre: string
          nota: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dias_vencimiento_cartera?: number
          id?: string
          nombre: string
          nota?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          dias_vencimiento_cartera?: number
          id?: string
          nombre?: string
          nota?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      incidencias: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_incidencia"]
          fecha: string
          id: string
          prioridad: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelta_en: string | null
          tipo: Database["public"]["Enums"]["tipo_incidencia"]
          titulo: string
          updated_at: string
          vehiculo_id: string | null
          viaje_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_incidencia"]
          fecha?: string
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelta_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_incidencia"]
          titulo: string
          updated_at?: string
          vehiculo_id?: string | null
          viaje_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_incidencia"]
          fecha?: string
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelta_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_incidencia"]
          titulo?: string
          updated_at?: string
          vehiculo_id?: string | null
          viaje_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "incidencias_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      ipler_execution_log: {
        Row: {
          candidatos_omitidos: number
          candidatos_procesados: number
          created_at: string
          execution_id: string
          id: number
          mensaje: string | null
          spreadsheet_id: string | null
          status: string
          timestamp_fin: string | null
          timestamp_inicio: string | null
        }
        Insert: {
          candidatos_omitidos?: number
          candidatos_procesados?: number
          created_at?: string
          execution_id: string
          id?: never
          mensaje?: string | null
          spreadsheet_id?: string | null
          status: string
          timestamp_fin?: string | null
          timestamp_inicio?: string | null
        }
        Update: {
          candidatos_omitidos?: number
          candidatos_procesados?: number
          created_at?: string
          execution_id?: string
          id?: never
          mensaje?: string | null
          spreadsheet_id?: string | null
          status?: string
          timestamp_fin?: string | null
          timestamp_inicio?: string | null
        }
        Relationships: []
      }
      ipler_workflow_config: {
        Row: {
          computrabajo_email: string
          computrabajo_password: string | null
          empresa_cf: string
          id: string
          max_candidatos: number
          oferta_oi: string
          portal_base_url: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          computrabajo_email: string
          computrabajo_password?: string | null
          empresa_cf: string
          id?: string
          max_candidatos?: number
          oferta_oi: string
          portal_base_url: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          computrabajo_email?: string
          computrabajo_password?: string | null
          empresa_cf?: string
          id?: string
          max_candidatos?: number
          oferta_oi?: string
          portal_base_url?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mantenimientos: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string
          facturado: boolean
          fecha: string
          id: string
          proveedor: string | null
          valor: number
          vehiculo_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion: string
          facturado?: boolean
          fecha?: string
          id?: string
          proveedor?: string | null
          valor?: number
          vehiculo_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string
          facturado?: boolean
          fecha?: string
          id?: string
          proveedor?: string | null
          valor?: number
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mantenimientos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "mantenimientos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      obligaciones: {
        Row: {
          activo: boolean
          concepto_id: string
          created_at: string
          id: string
          mes: string
          monto: number
          pagado: boolean
        }
        Insert: {
          activo?: boolean
          concepto_id: string
          created_at?: string
          id?: string
          mes: string
          monto?: number
          pagado?: boolean
        }
        Update: {
          activo?: boolean
          concepto_id?: string
          created_at?: string
          id?: string
          mes?: string
          monto?: number
          pagado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "obligaciones_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_obligacion"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          fecha: string
          id: string
          tipo_transaccion: string
          valor: number
          viaje_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          fecha: string
          id?: string
          tipo_transaccion?: string
          valor: number
          viaje_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          tipo_transaccion?: string
          valor?: number
          viaje_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_conductor: {
        Row: {
          comentarios: string | null
          created_at: string
          fecha_pago: string
          id: string
          tipo_pago: string
          valor: number
          viaje_id: string
        }
        Insert: {
          comentarios?: string | null
          created_at?: string
          fecha_pago?: string
          id?: string
          tipo_pago: string
          valor?: number
          viaje_id: string
        }
        Update: {
          comentarios?: string | null
          created_at?: string
          fecha_pago?: string
          id?: string
          tipo_pago?: string
          valor?: number
          viaje_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_conductor_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      peajes_transacciones: {
        Row: {
          activo: boolean
          comercio: string | null
          created_at: string
          documento_soporte_id: string | null
          estado_asignacion: string
          estado_transaccion: string | null
          fecha_paso: string | null
          fecha_transaccion: string
          id: string
          placa: string | null
          servicio: string | null
          updated_at: string
          valor: number
          vehiculo_id: string | null
          viaje_id: string | null
        }
        Insert: {
          activo?: boolean
          comercio?: string | null
          created_at?: string
          documento_soporte_id?: string | null
          estado_asignacion?: string
          estado_transaccion?: string | null
          fecha_paso?: string | null
          fecha_transaccion: string
          id?: string
          placa?: string | null
          servicio?: string | null
          updated_at?: string
          valor: number
          vehiculo_id?: string | null
          viaje_id?: string | null
        }
        Update: {
          activo?: boolean
          comercio?: string | null
          created_at?: string
          documento_soporte_id?: string | null
          estado_asignacion?: string
          estado_transaccion?: string | null
          fecha_paso?: string | null
          fecha_transaccion?: string
          id?: string
          placa?: string | null
          servicio?: string | null
          updated_at?: string
          valor?: number
          vehiculo_id?: string | null
          viaje_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peajes_transacciones_documento_soporte_id_fkey"
            columns: ["documento_soporte_id"]
            isOneToOne: false
            referencedRelation: "documentos_soporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peajes_transacciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "peajes_transacciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peajes_transacciones_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "v_viajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peajes_transacciones_viaje_id_fkey"
            columns: ["viaje_id"]
            isOneToOne: false
            referencedRelation: "viajes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          requiere_frio: boolean
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          requiere_frio?: boolean
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          requiere_frio?: boolean
        }
        Relationships: []
      }
      rutas: {
        Row: {
          activo: boolean
          consecutivo: number
          created_at: string
          destino: string
          distancia_km: number | null
          id: string
          origen: string
          peajes: number
          tiempo_estimado_horas: number | null
        }
        Insert: {
          activo?: boolean
          consecutivo?: number
          created_at?: string
          destino: string
          distancia_km?: number | null
          id?: string
          origen: string
          peajes?: number
          tiempo_estimado_horas?: number | null
        }
        Update: {
          activo?: boolean
          consecutivo?: number
          created_at?: string
          destino?: string
          distancia_km?: number | null
          id?: string
          origen?: string
          peajes?: number
          tiempo_estimado_horas?: number | null
        }
        Relationships: []
      }
      salidas_almacen: {
        Row: {
          asunto_original: string | null
          created_at: string
          empresa_cliente: string | null
          fecha_solicitud: string | null
          gmail_message_id: string | null
          id: number
          motivo: string | null
          productos: Json | null
          resumen_ejecutivo: string | null
          solicitante_email: string | null
          solicitante_nombre: string | null
        }
        Insert: {
          asunto_original?: string | null
          created_at?: string
          empresa_cliente?: string | null
          fecha_solicitud?: string | null
          gmail_message_id?: string | null
          id?: never
          motivo?: string | null
          productos?: Json | null
          resumen_ejecutivo?: string | null
          solicitante_email?: string | null
          solicitante_nombre?: string | null
        }
        Update: {
          asunto_original?: string | null
          created_at?: string
          empresa_cliente?: string | null
          fecha_solicitud?: string | null
          gmail_message_id?: string | null
          id?: never
          motivo?: string | null
          productos?: Json | null
          resumen_ejecutivo?: string | null
          solicitante_email?: string | null
          solicitante_nombre?: string | null
        }
        Relationships: []
      }
      sjap_archivos_cierre: {
        Row: {
          created_at: string
          errores: Json | null
          estacion_id: string
          estado: string
          fecha: string
          hash_archivo: string | null
          hojas_detectadas: Json | null
          id: string
          nombre_archivo: string
          procesado_en: string | null
          subido_por: string | null
          tamano_bytes: number | null
          version: number
        }
        Insert: {
          created_at?: string
          errores?: Json | null
          estacion_id: string
          estado?: string
          fecha: string
          hash_archivo?: string | null
          hojas_detectadas?: Json | null
          id?: string
          nombre_archivo: string
          procesado_en?: string | null
          subido_por?: string | null
          tamano_bytes?: number | null
          version?: number
        }
        Update: {
          created_at?: string
          errores?: Json | null
          estacion_id?: string
          estado?: string
          fecha?: string
          hash_archivo?: string | null
          hojas_detectadas?: Json | null
          id?: string
          nombre_archivo?: string
          procesado_en?: string | null
          subido_por?: string | null
          tamano_bytes?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_archivos_cierre_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_archivos_cierre_historial: {
        Row: {
          archivo_id: string
          errores: Json | null
          estado_resultado: string
          hash_archivo: string | null
          id: string
          procesado_en: string
          version: number
        }
        Insert: {
          archivo_id: string
          errores?: Json | null
          estado_resultado: string
          hash_archivo?: string | null
          id?: string
          procesado_en?: string
          version: number
        }
        Update: {
          archivo_id?: string
          errores?: Json | null
          estado_resultado?: string
          hash_archivo?: string | null
          id?: string
          procesado_en?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_archivos_cierre_historial_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_auditoria: {
        Row: {
          accion: string
          archivo_id: string | null
          created_at: string
          created_by: string | null
          detalle: Json | null
          entidad: string
          entidad_id: string | null
          estacion_id: string | null
          id: string
          nivel: string
        }
        Insert: {
          accion: string
          archivo_id?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: Json | null
          entidad: string
          entidad_id?: string | null
          estacion_id?: string | null
          id?: string
          nivel?: string
        }
        Update: {
          accion?: string
          archivo_id?: string | null
          created_at?: string
          created_by?: string | null
          detalle?: Json | null
          entidad?: string
          entidad_id?: string | null
          estacion_id?: string | null
          id?: string
          nivel?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_auditoria_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_auditoria_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_ausencias: {
        Row: {
          created_at: string
          estacion_id: string
          fecha_desde: string
          fecha_hasta: string
          id: string
          nota: string | null
          promotor_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          estacion_id: string
          fecha_desde: string
          fecha_hasta: string
          id?: string
          nota?: string | null
          promotor_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          estacion_id?: string
          fecha_desde?: string
          fecha_hasta?: string
          id?: string
          nota?: string | null
          promotor_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_ausencias_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_ausencias_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "sjap_promotores"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_balance_diario_producto: {
        Row: {
          calculado_en: string
          estacion_id: string
          estado: string
          fecha: string
          fluctuacion_acumulada: number | null
          fluctuacion_dia: number | null
          fluctuacion_valor: number | null
          id: string
          inventario_final_real: number | null
          inventario_inicial: number | null
          inventario_teorico: number | null
          precio_vigente: number | null
          producto_id: string
          recibos_galones: number
          ventas_galones: number
        }
        Insert: {
          calculado_en?: string
          estacion_id: string
          estado?: string
          fecha: string
          fluctuacion_acumulada?: number | null
          fluctuacion_dia?: number | null
          fluctuacion_valor?: number | null
          id?: string
          inventario_final_real?: number | null
          inventario_inicial?: number | null
          inventario_teorico?: number | null
          precio_vigente?: number | null
          producto_id: string
          recibos_galones?: number
          ventas_galones?: number
        }
        Update: {
          calculado_en?: string
          estacion_id?: string
          estado?: string
          fecha?: string
          fluctuacion_acumulada?: number | null
          fluctuacion_dia?: number | null
          fluctuacion_valor?: number | null
          id?: string
          inventario_final_real?: number | null
          inventario_inicial?: number | null
          inventario_teorico?: number | null
          precio_vigente?: number | null
          producto_id?: string
          recibos_galones?: number
          ventas_galones?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_balance_diario_producto_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_balance_diario_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_cierre_diario: {
        Row: {
          archivo_id: string | null
          calculado_en: string
          certificacion_bancaria: number | null
          diferencia_caja: number | null
          diferencia_caja_acumulada: number | null
          diferencia_certificacion: number | null
          efectivo_calculado: number | null
          efectivo_real: number | null
          estacion_id: string
          estado: string
          fecha: string
          id: string
          numero_clientes: number | null
          venta_galones_total: number
          venta_total: number
        }
        Insert: {
          archivo_id?: string | null
          calculado_en?: string
          certificacion_bancaria?: number | null
          diferencia_caja?: number | null
          diferencia_caja_acumulada?: number | null
          diferencia_certificacion?: number | null
          efectivo_calculado?: number | null
          efectivo_real?: number | null
          estacion_id: string
          estado?: string
          fecha: string
          id?: string
          numero_clientes?: number | null
          venta_galones_total?: number
          venta_total?: number
        }
        Update: {
          archivo_id?: string | null
          calculado_en?: string
          certificacion_bancaria?: number | null
          diferencia_caja?: number | null
          diferencia_caja_acumulada?: number | null
          diferencia_certificacion?: number | null
          efectivo_calculado?: number | null
          efectivo_real?: number | null
          estacion_id?: string
          estado?: string
          fecha?: string
          id?: string
          numero_clientes?: number | null
          venta_galones_total?: number
          venta_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_cierre_diario_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_cierre_diario_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_cuentas_cliente: {
        Row: {
          activo: boolean
          created_at: string
          estacion_id: string
          id: string
          nit: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          estacion_id: string
          id?: string
          nit?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          estacion_id?: string
          id?: string
          nit?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_cuentas_cliente_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_despachos_producto: {
        Row: {
          archivo_id: string
          cantidad: number
          created_at: string
          descuento: number | null
          estacion_id: string
          fecha: string
          id: string
          precio: number | null
          producto_id: string | null
          producto_nombre_original: string
          unidad: string | null
          venta_total: number | null
        }
        Insert: {
          archivo_id: string
          cantidad?: number
          created_at?: string
          descuento?: number | null
          estacion_id: string
          fecha: string
          id?: string
          precio?: number | null
          producto_id?: string | null
          producto_nombre_original: string
          unidad?: string | null
          venta_total?: number | null
        }
        Update: {
          archivo_id?: string
          cantidad?: number
          created_at?: string
          descuento?: number | null
          estacion_id?: string
          fecha?: string
          id?: string
          precio?: number | null
          producto_id?: string | null
          producto_nombre_original?: string
          unidad?: string | null
          venta_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_despachos_producto_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_despachos_producto_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_despachos_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_efectivo_diario: {
        Row: {
          capturado_en: string
          capturado_por: string | null
          certificacion_bancaria: number | null
          efectivo_real: number | null
          estacion_id: string
          fecha: string
          id: string
          notas: string | null
          origen: string
        }
        Insert: {
          capturado_en?: string
          capturado_por?: string | null
          certificacion_bancaria?: number | null
          efectivo_real?: number | null
          estacion_id: string
          fecha: string
          id?: string
          notas?: string | null
          origen?: string
        }
        Update: {
          capturado_en?: string
          capturado_por?: string | null
          certificacion_bancaria?: number | null
          efectivo_real?: number | null
          estacion_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_efectivo_diario_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_estaciones: {
        Row: {
          activa: boolean
          bandera: string | null
          ciudad: string | null
          created_at: string
          id: string
          nit: string | null
          nombre: string
          razon_social: string | null
        }
        Insert: {
          activa?: boolean
          bandera?: string | null
          ciudad?: string | null
          created_at?: string
          id?: string
          nit?: string | null
          nombre: string
          razon_social?: string | null
        }
        Update: {
          activa?: boolean
          bandera?: string | null
          ciudad?: string | null
          created_at?: string
          id?: string
          nit?: string | null
          nombre?: string
          razon_social?: string | null
        }
        Relationships: []
      }
      sjap_facturas_compra: {
        Row: {
          cantidad: number
          capturado_en: string
          capturado_por: string | null
          estacion_id: string
          fecha: string
          id: string
          notas: string | null
          numero_factura: string | null
          origen: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          capturado_en?: string
          capturado_por?: string | null
          estacion_id: string
          fecha: string
          id?: string
          notas?: string | null
          numero_factura?: string | null
          origen?: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          capturado_en?: string
          capturado_por?: string | null
          estacion_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          numero_factura?: string | null
          origen?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_facturas_compra_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_facturas_compra_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_islas: {
        Row: {
          activo: boolean
          created_at: string
          estacion_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          estacion_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          estacion_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_islas_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_lecturas_inventario: {
        Row: {
          capturado_en: string
          capturado_por: string | null
          estacion_id: string
          fecha: string
          id: string
          inventario_final_real: number
          notas: string | null
          origen: string
          producto_id: string
        }
        Insert: {
          capturado_en?: string
          capturado_por?: string | null
          estacion_id: string
          fecha: string
          id?: string
          inventario_final_real: number
          notas?: string | null
          origen?: string
          producto_id: string
        }
        Update: {
          capturado_en?: string
          capturado_por?: string | null
          estacion_id?: string
          fecha?: string
          id?: string
          inventario_final_real?: number
          notas?: string | null
          origen?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_lecturas_inventario_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_lecturas_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_movimientos_cuenta_cliente: {
        Row: {
          archivo_id: string | null
          created_at: string
          cuenta_id: string
          fecha: string
          id: string
          monto: number
          origen: string
          tipo: string
        }
        Insert: {
          archivo_id?: string | null
          created_at?: string
          cuenta_id: string
          fecha: string
          id?: string
          monto?: number
          origen?: string
          tipo: string
        }
        Update: {
          archivo_id?: string | null
          created_at?: string
          cuenta_id?: string
          fecha?: string
          id?: string
          monto?: number
          origen?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_movimientos_cuenta_cliente_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_movimientos_cuenta_cliente_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "sjap_cuentas_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_precios_producto: {
        Row: {
          created_at: string
          id: string
          precio: number
          producto_id: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          id?: string
          precio: number
          producto_id: string
          vigente_desde: string
        }
        Update: {
          created_at?: string
          id?: string
          precio?: number
          producto_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_precios_producto_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_presupuesto_mensual: {
        Row: {
          anio: number
          clientes_paso: number | null
          clientes_propios: number | null
          compra: number | null
          created_at: string
          cumplimiento: number | null
          estacion_id: string
          id: string
          mes: number
          origen: string
          pct_clientes_paso: number | null
          pct_clientes_propios: number | null
          pct_rumbo: number | null
          presupuesto_acpm: number | null
          presupuesto_corriente: number | null
          presupuesto_extra: number | null
          presupuesto_total: number | null
          rumbo: number | null
          ventas: number | null
        }
        Insert: {
          anio: number
          clientes_paso?: number | null
          clientes_propios?: number | null
          compra?: number | null
          created_at?: string
          cumplimiento?: number | null
          estacion_id: string
          id?: string
          mes: number
          origen?: string
          pct_clientes_paso?: number | null
          pct_clientes_propios?: number | null
          pct_rumbo?: number | null
          presupuesto_acpm?: number | null
          presupuesto_corriente?: number | null
          presupuesto_extra?: number | null
          presupuesto_total?: number | null
          rumbo?: number | null
          ventas?: number | null
        }
        Update: {
          anio?: number
          clientes_paso?: number | null
          clientes_propios?: number | null
          compra?: number | null
          created_at?: string
          cumplimiento?: number | null
          estacion_id?: string
          id?: string
          mes?: number
          origen?: string
          pct_clientes_paso?: number | null
          pct_clientes_propios?: number | null
          pct_rumbo?: number | null
          presupuesto_acpm?: number | null
          presupuesto_corriente?: number | null
          presupuesto_extra?: number | null
          presupuesto_total?: number | null
          rumbo?: number | null
          ventas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_presupuesto_mensual_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_productos: {
        Row: {
          activo: boolean
          alias: string[]
          codigo: string
          created_at: string
          estacion_id: string
          id: string
          nombre_visible: string
          orden: number
          unidad: string
        }
        Insert: {
          activo?: boolean
          alias?: string[]
          codigo: string
          created_at?: string
          estacion_id: string
          id?: string
          nombre_visible: string
          orden?: number
          unidad?: string
        }
        Update: {
          activo?: boolean
          alias?: string[]
          codigo?: string
          created_at?: string
          estacion_id?: string
          id?: string
          nombre_visible?: string
          orden?: number
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_productos_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_promotores: {
        Row: {
          activo: boolean
          created_at: string
          estacion_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          estacion_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          estacion_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_promotores_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_sicom_mensual: {
        Row: {
          anio: number
          compras: number | null
          created_at: string
          estacion_id: string
          evaporacion: number | null
          faltantes: number | null
          id: string
          inventario_final_calculado: number | null
          inventario_final_real: number | null
          inventario_inicial: number | null
          mes: number
          origen: string
          producto_id: string | null
          producto_nombre_original: string
          ventas: number | null
        }
        Insert: {
          anio: number
          compras?: number | null
          created_at?: string
          estacion_id: string
          evaporacion?: number | null
          faltantes?: number | null
          id?: string
          inventario_final_calculado?: number | null
          inventario_final_real?: number | null
          inventario_inicial?: number | null
          mes: number
          origen?: string
          producto_id?: string | null
          producto_nombre_original: string
          ventas?: number | null
        }
        Update: {
          anio?: number
          compras?: number | null
          created_at?: string
          estacion_id?: string
          evaporacion?: number | null
          faltantes?: number | null
          id?: string
          inventario_final_calculado?: number | null
          inventario_final_real?: number | null
          inventario_inicial?: number | null
          mes?: number
          origen?: string
          producto_id?: string | null
          producto_nombre_original?: string
          ventas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_sicom_mensual_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_sicom_mensual_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "sjap_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_transacciones: {
        Row: {
          archivo_id: string
          cantidad: number | null
          categoria: string
          consecutivo: string | null
          created_at: string
          descuento: number | null
          estacion_id: string
          fecha: string
          hora: string | null
          id: string
          impuesto_total: number | null
          prefijo: string | null
          producto_nombre: string | null
          promotor_nombre: string | null
          subtotal: number | null
          tipo_factura: string | null
          total: number | null
          unidad: string | null
        }
        Insert: {
          archivo_id: string
          cantidad?: number | null
          categoria: string
          consecutivo?: string | null
          created_at?: string
          descuento?: number | null
          estacion_id: string
          fecha: string
          hora?: string | null
          id?: string
          impuesto_total?: number | null
          prefijo?: string | null
          producto_nombre?: string | null
          promotor_nombre?: string | null
          subtotal?: number | null
          tipo_factura?: string | null
          total?: number | null
          unidad?: string | null
        }
        Update: {
          archivo_id?: string
          cantidad?: number | null
          categoria?: string
          consecutivo?: string | null
          created_at?: string
          descuento?: number | null
          estacion_id?: string
          fecha?: string
          hora?: string | null
          id?: string
          impuesto_total?: number | null
          prefijo?: string | null
          producto_nombre?: string | null
          promotor_nombre?: string | null
          subtotal?: number | null
          tipo_factura?: string | null
          total?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_transacciones_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_transacciones_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_turno_tipos: {
        Row: {
          activo: boolean
          created_at: string
          estacion_id: string
          hora_fin: string
          hora_inicio: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          estacion_id: string
          hora_fin: string
          hora_inicio: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          estacion_id?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_turno_tipos_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_turnos_programados: {
        Row: {
          created_at: string
          estacion_id: string
          estado: string
          fecha: string
          id: string
          isla_id: string
          promotor_id: string
          turno_tipo_id: string
        }
        Insert: {
          created_at?: string
          estacion_id: string
          estado?: string
          fecha: string
          id?: string
          isla_id: string
          promotor_id: string
          turno_tipo_id: string
        }
        Update: {
          created_at?: string
          estacion_id?: string
          estado?: string
          fecha?: string
          id?: string
          isla_id?: string
          promotor_id?: string
          turno_tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_turnos_programados_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_turnos_programados_isla_id_fkey"
            columns: ["isla_id"]
            isOneToOne: false
            referencedRelation: "sjap_islas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_turnos_programados_promotor_id_fkey"
            columns: ["promotor_id"]
            isOneToOne: false
            referencedRelation: "sjap_promotores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_turnos_programados_turno_tipo_id_fkey"
            columns: ["turno_tipo_id"]
            isOneToOne: false
            referencedRelation: "sjap_turno_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_urea_diario: {
        Row: {
          clientes_propios_litros: number | null
          costo_unitario: number | null
          created_at: string
          diferencia: number | null
          estacion_id: string
          fecha: string
          id: string
          inventario_final: number | null
          inventario_inicial: number | null
          inventario_teorico: number | null
          origen: string
          recibo: number | null
          rumbo_litros: number | null
          total: number | null
          valor: number | null
          valor_propios: number | null
          valor_rumbo: number | null
        }
        Insert: {
          clientes_propios_litros?: number | null
          costo_unitario?: number | null
          created_at?: string
          diferencia?: number | null
          estacion_id: string
          fecha: string
          id?: string
          inventario_final?: number | null
          inventario_inicial?: number | null
          inventario_teorico?: number | null
          origen?: string
          recibo?: number | null
          rumbo_litros?: number | null
          total?: number | null
          valor?: number | null
          valor_propios?: number | null
          valor_rumbo?: number | null
        }
        Update: {
          clientes_propios_litros?: number | null
          costo_unitario?: number | null
          created_at?: string
          diferencia?: number | null
          estacion_id?: string
          fecha?: string
          id?: string
          inventario_final?: number | null
          inventario_inicial?: number | null
          inventario_teorico?: number | null
          origen?: string
          recibo?: number | null
          rumbo_litros?: number | null
          total?: number | null
          valor?: number | null
          valor_propios?: number | null
          valor_rumbo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_urea_diario_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_usuarios: {
        Row: {
          auth_user_id: string
          created_at: string
          estacion_id: string
          id: string
          rol: string
          username: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          estacion_id: string
          id?: string
          rol?: string
          username: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          estacion_id?: string
          id?: string
          rol?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "sjap_usuarios_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_ventas_medio_pago: {
        Row: {
          archivo_id: string
          created_at: string
          estacion_id: string
          fecha: string
          id: string
          medio_pago: string
          numero_ventas: number
          total_ventas: number
        }
        Insert: {
          archivo_id: string
          created_at?: string
          estacion_id: string
          fecha: string
          id?: string
          medio_pago: string
          numero_ventas?: number
          total_ventas?: number
        }
        Update: {
          archivo_id?: string
          created_at?: string
          estacion_id?: string
          fecha?: string
          id?: string
          medio_pago?: string
          numero_ventas?: number
          total_ventas?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_ventas_medio_pago_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_ventas_medio_pago_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_ventas_promotor_resumen: {
        Row: {
          archivo_id: string
          created_at: string
          estacion_id: string
          fecha: string
          id: string
          numero_ventas: number
          promotor_nombre: string
          total_ventas: number
        }
        Insert: {
          archivo_id: string
          created_at?: string
          estacion_id: string
          fecha: string
          id?: string
          numero_ventas?: number
          promotor_nombre: string
          total_ventas?: number
        }
        Update: {
          archivo_id?: string
          created_at?: string
          estacion_id?: string
          fecha?: string
          id?: string
          numero_ventas?: number
          promotor_nombre?: string
          total_ventas?: number
        }
        Relationships: [
          {
            foreignKeyName: "sjap_ventas_promotor_resumen_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "sjap_archivos_cierre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sjap_ventas_promotor_resumen_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      sjap_ventas_promotor_turno: {
        Row: {
          created_at: string
          estacion_id: string
          fecha: string
          galones: number | null
          id: string
          isla: string | null
          numero_clientes: number | null
          origen: string
          promotor_nombre: string
          turno: string | null
        }
        Insert: {
          created_at?: string
          estacion_id: string
          fecha: string
          galones?: number | null
          id?: string
          isla?: string | null
          numero_clientes?: number | null
          origen?: string
          promotor_nombre: string
          turno?: string | null
        }
        Update: {
          created_at?: string
          estacion_id?: string
          fecha?: string
          galones?: number | null
          id?: string
          isla?: string | null
          numero_clientes?: number | null
          origen?: string
          promotor_nombre?: string
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sjap_ventas_promotor_turno_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "sjap_estaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          activo: boolean
          anio: number | null
          capacidad_kg: number | null
          conductor_id: string | null
          created_at: string
          id: string
          marca: string | null
          modelo: string | null
          placa: string
          tipo_carroceria: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          anio?: number | null
          capacidad_kg?: number | null
          conductor_id?: string | null
          created_at?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          placa: string
          tipo_carroceria?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          anio?: number | null
          capacidad_kg?: number | null
          conductor_id?: string | null
          created_at?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          placa?: string
          tipo_carroceria?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
        ]
      }
      viajes: {
        Row: {
          anticipo_pagado: boolean
          cargue_descargue: number
          cliente_id: string | null
          comentarios_manifiesto: string | null
          conductor_id: string | null
          conductor_nombre: string | null
          created_at: string
          destinatario_anticipo: Database["public"]["Enums"]["destinatario_anticipo"]
          destino: string | null
          devolucion_conductor: number
          empresa_pagadora_id: string | null
          escalas_detalle: string | null
          estado_liquidacion: Database["public"]["Enums"]["estado_liquidacion"]
          estado_operativo: Database["public"]["Enums"]["estado_operativo"]
          estado_pago_conductor: Database["public"]["Enums"]["estado_pago_conductor"]
          fecha: string
          fecha_pago_anticipo: string | null
          fecha_pago_gasto: string | null
          fecha_pago_pendiente: string | null
          flete_viaje: number | null
          id: string
          motivo_cancelacion: string | null
          neto_facturado: number | null
          numero_escalas: number | null
          numero_manifiesto: string | null
          origen: string | null
          otros: number
          otros_gastos: number
          pago_conductor: number | null
          peajes: number
          peajes_modificado: boolean
          peajes_motivo_cambio: string | null
          peso_kg: number | null
          placa: string | null
          porcentaje_anticipo: number
          producto_id: string | null
          retefuente: number
          reteica: number
          ruta_consecutivo: number | null
          ruta_id: string | null
          saldo_cliente: number | null
          tiene_escalas: boolean
          tipo: Database["public"]["Enums"]["tipo_viaje"]
          updated_at: string
          valor_anticipo: number | null
          valor_pendiente_margen_neto: number | null
          valor_total_viaje: number
          vehiculo_id: string | null
        }
        Insert: {
          anticipo_pagado?: boolean
          cargue_descargue?: number
          cliente_id?: string | null
          comentarios_manifiesto?: string | null
          conductor_id?: string | null
          conductor_nombre?: string | null
          created_at?: string
          destinatario_anticipo?: Database["public"]["Enums"]["destinatario_anticipo"]
          destino?: string | null
          devolucion_conductor?: number
          empresa_pagadora_id?: string | null
          escalas_detalle?: string | null
          estado_liquidacion?: Database["public"]["Enums"]["estado_liquidacion"]
          estado_operativo?: Database["public"]["Enums"]["estado_operativo"]
          estado_pago_conductor?: Database["public"]["Enums"]["estado_pago_conductor"]
          fecha?: string
          fecha_pago_anticipo?: string | null
          fecha_pago_gasto?: string | null
          fecha_pago_pendiente?: string | null
          flete_viaje?: number | null
          id?: string
          motivo_cancelacion?: string | null
          neto_facturado?: number | null
          numero_escalas?: number | null
          numero_manifiesto?: string | null
          origen?: string | null
          otros?: number
          otros_gastos?: number
          pago_conductor?: number | null
          peajes?: number
          peajes_modificado?: boolean
          peajes_motivo_cambio?: string | null
          peso_kg?: number | null
          placa?: string | null
          porcentaje_anticipo?: number
          producto_id?: string | null
          retefuente?: number
          reteica?: number
          ruta_consecutivo?: number | null
          ruta_id?: string | null
          saldo_cliente?: number | null
          tiene_escalas?: boolean
          tipo?: Database["public"]["Enums"]["tipo_viaje"]
          updated_at?: string
          valor_anticipo?: number | null
          valor_pendiente_margen_neto?: number | null
          valor_total_viaje?: number
          vehiculo_id?: string | null
        }
        Update: {
          anticipo_pagado?: boolean
          cargue_descargue?: number
          cliente_id?: string | null
          comentarios_manifiesto?: string | null
          conductor_id?: string | null
          conductor_nombre?: string | null
          created_at?: string
          destinatario_anticipo?: Database["public"]["Enums"]["destinatario_anticipo"]
          destino?: string | null
          devolucion_conductor?: number
          empresa_pagadora_id?: string | null
          escalas_detalle?: string | null
          estado_liquidacion?: Database["public"]["Enums"]["estado_liquidacion"]
          estado_operativo?: Database["public"]["Enums"]["estado_operativo"]
          estado_pago_conductor?: Database["public"]["Enums"]["estado_pago_conductor"]
          fecha?: string
          fecha_pago_anticipo?: string | null
          fecha_pago_gasto?: string | null
          fecha_pago_pendiente?: string | null
          flete_viaje?: number | null
          id?: string
          motivo_cancelacion?: string | null
          neto_facturado?: number | null
          numero_escalas?: number | null
          numero_manifiesto?: string | null
          origen?: string | null
          otros?: number
          otros_gastos?: number
          pago_conductor?: number | null
          peajes?: number
          peajes_modificado?: boolean
          peajes_motivo_cambio?: string | null
          peso_kg?: number | null
          placa?: string | null
          porcentaje_anticipo?: number
          producto_id?: string | null
          retefuente?: number
          reteica?: number
          ruta_consecutivo?: number | null
          ruta_id?: string | null
          saldo_cliente?: number | null
          tiene_escalas?: boolean
          tipo?: Database["public"]["Enums"]["tipo_viaje"]
          updated_at?: string
          valor_anticipo?: number | null
          valor_pendiente_margen_neto?: number | null
          valor_total_viaje?: number
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_empresa_pagadora_id_fkey"
            columns: ["empresa_pagadora_id"]
            isOneToOne: false
            referencedRelation: "empresas_pagadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          acciones_solicitadas: Json | null
          acuerdos_compromisos: Json | null
          consumo_mensual: string | null
          created_at: string
          datos_contacto: Json | null
          fecha_visita: string | null
          gmail_message_id: string | null
          id: number
          nivel_interes: string | null
          nombre_empresa: string | null
          persona_contacto: Json | null
          precio_referencia: string | null
          producto_marca_competencia: string | null
          quejas_reclamos: string | null
          resumen_ejecutivo: string | null
          sector_actividad: string | null
          situacion_actual: string | null
          ubicacion: string | null
        }
        Insert: {
          acciones_solicitadas?: Json | null
          acuerdos_compromisos?: Json | null
          consumo_mensual?: string | null
          created_at?: string
          datos_contacto?: Json | null
          fecha_visita?: string | null
          gmail_message_id?: string | null
          id?: number
          nivel_interes?: string | null
          nombre_empresa?: string | null
          persona_contacto?: Json | null
          precio_referencia?: string | null
          producto_marca_competencia?: string | null
          quejas_reclamos?: string | null
          resumen_ejecutivo?: string | null
          sector_actividad?: string | null
          situacion_actual?: string | null
          ubicacion?: string | null
        }
        Update: {
          acciones_solicitadas?: Json | null
          acuerdos_compromisos?: Json | null
          consumo_mensual?: string | null
          created_at?: string
          datos_contacto?: Json | null
          fecha_visita?: string | null
          gmail_message_id?: string | null
          id?: number
          nivel_interes?: string | null
          nombre_empresa?: string | null
          persona_contacto?: Json | null
          precio_referencia?: string | null
          producto_marca_competencia?: string | null
          quejas_reclamos?: string | null
          resumen_ejecutivo?: string | null
          sector_actividad?: string | null
          situacion_actual?: string | null
          ubicacion?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_cartera: {
        Row: {
          cliente_id: string | null
          cliente_nombre: string | null
          empresa_pagadora_id: string | null
          empresa_pagadora_nombre: string | null
          estatus_cobro: string | null
          num_viajes: number | null
          total_pendiente: number | null
        }
        Relationships: [
          {
            foreignKeyName: "viajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_empresa_pagadora_id_fkey"
            columns: ["empresa_pagadora_id"]
            isOneToOne: false
            referencedRelation: "empresas_pagadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      v_costos_por_concepto: {
        Row: {
          mes: string | null
          num_movimientos: number | null
          tipo: string | null
          total_valor: number | null
        }
        Relationships: []
      }
      v_rentabilidad_vehiculo: {
        Row: {
          neto_consolidado: number | null
          num_viajes: number | null
          placa: string | null
          total_anticipo: number | null
          total_egresos_operacionales: number | null
          total_facturado: number | null
          total_ingresos_operacionales: number | null
          total_margen_neto: number | null
          vehiculo_id: string | null
        }
        Relationships: []
      }
      v_rutas_rentabilidad: {
        Row: {
          destino: string | null
          margen_promedio_viaje: number | null
          neto_consolidado: number | null
          num_viajes: number | null
          origen: string | null
          ruta_consecutivo: number | null
          total_egresos_operacionales: number | null
          total_facturado: number | null
          total_ingresos_operacionales: number | null
          total_margen_neto: number | null
        }
        Relationships: []
      }
      v_totales_mes: {
        Row: {
          mes: string | null
          neto_consolidado: number | null
          num_viajes: number | null
          rentabilidad_total: number | null
          total_anticipo: number | null
          total_egresos_operacionales: number | null
          total_egresos_otros: number | null
          total_facturado: number | null
          total_ingresos_operacionales: number | null
          total_ingresos_otros: number | null
          total_margen_neto: number | null
          total_pendiente_cobro: number | null
        }
        Relationships: []
      }
      v_totales_semana: {
        Row: {
          num_viajes: number | null
          placa: string | null
          semana_inicio: string | null
          total_facturado: number | null
          total_margen_neto: number | null
          vehiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_viajes: {
        Row: {
          anticipo_pagado: boolean | null
          cargue_descargue: number | null
          cliente_id: string | null
          cliente_nombre: string | null
          comentarios_manifiesto: string | null
          conductor_id: string | null
          conductor_nombre: string | null
          created_at: string | null
          destinatario_anticipo:
            | Database["public"]["Enums"]["destinatario_anticipo"]
            | null
          destino: string | null
          devolucion_conductor: number | null
          dias_vencimiento_cartera: number | null
          documentos_soporte_activos: number | null
          edad_viaje_dias: number | null
          empresa_pagadora_id: string | null
          empresa_pagadora_nombre: string | null
          escalas_detalle: string | null
          estado_liquidacion:
            | Database["public"]["Enums"]["estado_liquidacion"]
            | null
          estado_operativo:
            | Database["public"]["Enums"]["estado_operativo"]
            | null
          estado_pago_conductor:
            | Database["public"]["Enums"]["estado_pago_conductor"]
            | null
          estatus_cobro: string | null
          fecha: string | null
          fecha_pago_anticipo: string | null
          fecha_pago_gasto: string | null
          fecha_pago_pendiente: string | null
          flete_viaje: number | null
          id: string | null
          motivo_cancelacion: string | null
          neto_facturado: number | null
          numero_escalas: number | null
          numero_manifiesto: string | null
          origen: string | null
          otros: number | null
          otros_gastos: number | null
          pago_conductor: number | null
          peajes: number | null
          peso_kg: number | null
          placa: string | null
          porcentaje_anticipo: number | null
          producto_id: string | null
          producto_nombre: string | null
          retefuente: number | null
          reteica: number | null
          ruta_consecutivo: number | null
          ruta_id: string | null
          saldo_cliente: number | null
          semana_inicio: string | null
          tiene_escalas: boolean | null
          tipo: Database["public"]["Enums"]["tipo_viaje"] | null
          updated_at: string | null
          valor_anticipo: number | null
          valor_pendiente_margen_neto: number | null
          valor_total_viaje: number | null
          valor_total_viaje_acumulado_mes: number | null
          vehiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_empresa_pagadora_id_fkey"
            columns: ["empresa_pagadora_id"]
            isOneToOne: false
            referencedRelation: "empresas_pagadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_vehiculo"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "viajes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dk_calculate_recipe_cost: {
        Args: { p_recipe_id: string }
        Returns: number
      }
      dk_confirm_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      dk_create_recipe_version: {
        Args: { p_items: Json; p_product_id: string }
        Returns: string
      }
      dk_current_profile_id: { Args: never; Returns: string }
      dk_current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["dk_role"]
      }
      dk_register_adjustment: {
        Args: {
          p_ingredient_id: string
          p_observation?: string
          p_quantity: number
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
    }
    Enums: {
      destinatario_anticipo:
        | "No Pagado"
        | "Conductor"
        | "Propietario"
        | "Administrador(a)"
      dk_movement_type: "COMPRA" | "MERMA" | "AJUSTE" | "CONSUMO" | "DEVOLUCION"
      dk_purchase_status: "BORRADOR" | "CONFIRMADA" | "ANULADA"
      dk_role:
        | "ADMIN"
        | "MANAGER"
        | "KITCHEN"
        | "INVENTORY"
        | "CASHIER"
        | "DELIVERY"
      dk_unit_type: "WEIGHT" | "VOLUME" | "UNIT"
      dk_waste_reason: "VENCIMIENTO" | "DANO" | "ERROR_PREPARACION" | "OTRO"
      estado_incidencia: "abierta" | "en_proceso" | "resuelta" | "cerrada"
      estado_liquidacion: "Pendiente" | "Pagada"
      estado_operativo:
        | "programado"
        | "asignado"
        | "en_transito"
        | "entregado"
        | "cancelado"
        | "con_incidencia"
      estado_pago_conductor: "Pendiente" | "Completado" | "Particular"
      prioridad_incidencia: "baja" | "media" | "alta" | "critica"
      tipo_incidencia:
        | "mecanica"
        | "accidente"
        | "retraso"
        | "reclamo_cliente"
        | "clima"
        | "documentacion"
        | "otro"
      tipo_viaje: "Generales" | "Multiparada"
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
      destinatario_anticipo: [
        "No Pagado",
        "Conductor",
        "Propietario",
        "Administrador(a)",
      ],
      dk_movement_type: ["COMPRA", "MERMA", "AJUSTE", "CONSUMO", "DEVOLUCION"],
      dk_purchase_status: ["BORRADOR", "CONFIRMADA", "ANULADA"],
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
      estado_incidencia: ["abierta", "en_proceso", "resuelta", "cerrada"],
      estado_liquidacion: ["Pendiente", "Pagada"],
      estado_operativo: [
        "programado",
        "asignado",
        "en_transito",
        "entregado",
        "cancelado",
        "con_incidencia",
      ],
      estado_pago_conductor: ["Pendiente", "Completado", "Particular"],
      prioridad_incidencia: ["baja", "media", "alta", "critica"],
      tipo_incidencia: [
        "mecanica",
        "accidente",
        "retraso",
        "reclamo_cliente",
        "clima",
        "documentacion",
        "otro",
      ],
      tipo_viaje: ["Generales", "Multiparada"],
    },
  },
} as const
