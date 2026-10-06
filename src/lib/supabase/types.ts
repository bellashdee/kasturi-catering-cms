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
      ai_conversations: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          helpful: boolean | null
          id: string
          page_context: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          helpful?: boolean | null
          id?: string
          page_context?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          helpful?: boolean | null
          id?: string
          page_context?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          module: string
          related_id: string
          related_table: string
          requested_by: string | null
          status: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          module: string
          related_id: string
          related_table: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          module?: string
          related_id?: string
          related_table?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          company_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          status: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          status?: string
          work_date: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          status?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          budgeted_amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          department: string | null
          id: string
          month: number
          notes: string | null
          year: number
        }
        Insert: {
          budgeted_amount: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          month: number
          notes?: string | null
          year: number
        }
        Update: {
          budgeted_amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          id?: string
          month?: number
          notes?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance: {
        Row: {
          campaign_id: string
          clicks: number | null
          company_id: string
          conversions: number | null
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          impressions: number | null
          leads_generated: number | null
          report_date: string
          spend: number | null
        }
        Insert: {
          campaign_id: string
          clicks?: number | null
          company_id: string
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          report_date: string
          spend?: number | null
        }
        Update: {
          campaign_id?: string
          clicks?: number | null
          company_id?: string
          conversions?: number | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          impressions?: number | null
          leads_generated?: number | null
          report_date?: string
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_performance_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_performance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_performance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_performance_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget: number | null
          channel: string
          company_id: string
          created_at: string
          end_date: string | null
          id: string
          name: string
          objective: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          budget?: number | null
          channel?: string
          company_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          objective?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          budget?: number | null
          channel?: string
          company_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          objective?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_events: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string | null
          event_date: string
          event_name: string
          event_time: string | null
          event_type: string
          id: string
          location: string | null
          menu_description: string | null
          package_menu_id: string | null
          pax_count: number | null
          special_requirements: string | null
          status: Database["public"]["Enums"]["event_status"]
          total_amount: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id?: string | null
          event_date: string
          event_name: string
          event_time?: string | null
          event_type?: string
          id?: string
          location?: string | null
          menu_description?: string | null
          package_menu_id?: string | null
          pax_count?: number | null
          special_requirements?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          total_amount?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string | null
          event_date?: string
          event_name?: string
          event_time?: string | null
          event_type?: string
          id?: string
          location?: string | null
          menu_description?: string | null
          package_menu_id?: string | null
          pax_count?: number | null
          special_requirements?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catering_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catering_events_package_menu_id_fkey"
            columns: ["package_menu_id"]
            isOneToOne: false
            referencedRelation: "package_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          legal_name: string
          name: string
          registration_no: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name: string
          name: string
          registration_no?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name?: string
          name?: string
          registration_no?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          doc_type: string
          document_id: string | null
          expiry_date: string | null
          id: string
          issued_date: string | null
          notes: string | null
          reference_number: string | null
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          doc_type: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          notes?: string | null
          reference_number?: string | null
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          notes?: string | null
          reference_number?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          campaign_id: string | null
          company_id: string
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          platform: string
          scheduled_date: string | null
          status: string
          title: string
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          content_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          platform: string
          scheduled_date?: string | null
          status?: string
          title: string
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          platform?: string
          scheduled_date?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          amount: number
          catering_event_id: string | null
          company_id: string
          created_at: string
          customer_id: string
          description: string | null
          document_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          quotation_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tax_amount: number
        }
        Insert: {
          amount: number
          catering_event_id?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          description?: string | null
          document_id?: string | null
          due_date: string
          id?: string
          invoice_date: string
          invoice_number: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_amount?: number
        }
        Update: {
          amount?: number
          catering_event_id?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          description?: string | null
          document_id?: string | null
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_invoices_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          customer_invoice_id: string
          id: string
          payment_date: string
          payment_reference: string | null
          payment_remarks: string | null
          recorded_by: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          customer_invoice_id: string
          id?: string
          payment_date: string
          payment_reference?: string | null
          payment_remarks?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          customer_invoice_id?: string
          id?: string
          payment_date?: string
          payment_reference?: string | null
          payment_remarks?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_invoice_id_fkey"
            columns: ["customer_invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          company_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          company_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          admin_override: boolean
          admin_override_by: string | null
          admin_override_reason: string | null
          catering_event_id: string | null
          company_id: string
          completed_at: string | null
          completion_remarks: string | null
          created_at: string
          delivery_vendor_id: string | null
          driver_id: string | null
          id: string
          items_description: string | null
          location: string | null
          notes: string | null
          proof_status: string
          scheduled_time: string | null
          status: string
          vehicle_id: string | null
        }
        Insert: {
          admin_override?: boolean
          admin_override_by?: string | null
          admin_override_reason?: string | null
          catering_event_id?: string | null
          company_id: string
          completed_at?: string | null
          completion_remarks?: string | null
          created_at?: string
          delivery_vendor_id?: string | null
          driver_id?: string | null
          id?: string
          items_description?: string | null
          location?: string | null
          notes?: string | null
          proof_status?: string
          scheduled_time?: string | null
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          admin_override?: boolean
          admin_override_by?: string | null
          admin_override_reason?: string | null
          catering_event_id?: string | null
          company_id?: string
          completed_at?: string | null
          completion_remarks?: string | null
          created_at?: string
          delivery_vendor_id?: string | null
          driver_id?: string | null
          id?: string
          items_description?: string | null
          location?: string | null
          notes?: string | null
          proof_status?: string
          scheduled_time?: string | null
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_delivery_vendor_id_fkey"
            columns: ["delivery_vendor_id"]
            isOneToOne: false
            referencedRelation: "delivery_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_vendors: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string
          extracted_data: Json | null
          extraction_status: string
          file_type: string
          id: string
          module: string
          original_filename: string
          related_id: string | null
          related_table: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          extracted_data?: Json | null
          extraction_status?: string
          file_type: string
          id?: string
          module: string
          original_filename: string
          related_id?: string | null
          related_table?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          extracted_data?: Json | null
          extraction_status?: string
          file_type?: string
          id?: string
          module?: string
          original_filename?: string
          related_id?: string | null
          related_table?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_attendance: {
        Row: {
          attendance_date: string
          clock_in_distance_km: number | null
          clock_in_document_id: string | null
          clock_in_latitude: number | null
          clock_in_longitude: number | null
          clock_in_remarks: string | null
          clock_in_time: string | null
          clock_out_distance_km: number | null
          clock_out_document_id: string | null
          clock_out_latitude: number | null
          clock_out_longitude: number | null
          clock_out_remarks: string | null
          clock_out_time: string | null
          company_id: string
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          created_at: string
          driver_id: string | null
          driver_name: string | null
          id: string
          is_corrected: boolean
          is_off_day: boolean
        }
        Insert: {
          attendance_date: string
          clock_in_distance_km?: number | null
          clock_in_document_id?: string | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_in_remarks?: string | null
          clock_in_time?: string | null
          clock_out_distance_km?: number | null
          clock_out_document_id?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          clock_out_remarks?: string | null
          clock_out_time?: string | null
          company_id: string
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          is_corrected?: boolean
          is_off_day?: boolean
        }
        Update: {
          attendance_date?: string
          clock_in_distance_km?: number | null
          clock_in_document_id?: string | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_in_remarks?: string | null
          clock_in_time?: string | null
          clock_out_distance_km?: number | null
          clock_out_document_id?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          clock_out_remarks?: string | null
          clock_out_time?: string | null
          company_id?: string
          corrected_at?: string | null
          corrected_by?: string | null
          correction_reason?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          is_corrected?: boolean
          is_off_day?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_attendance_clock_in_document_id_fkey"
            columns: ["clock_in_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_attendance_clock_out_document_id_fkey"
            columns: ["clock_out_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_attendance_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_expenses: {
        Row: {
          amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          delivery_id: string | null
          distance_km: number | null
          document_id: string | null
          driver_id: string | null
          expense_date: string
          id: string
          notes: string | null
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          delivery_id?: string | null
          distance_km?: number | null
          document_id?: string | null
          driver_id?: string | null
          expense_date: string
          id?: string
          notes?: string | null
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          delivery_id?: string | null
          distance_km?: number | null
          document_id?: string | null
          driver_id?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          approved_latitude: number | null
          approved_longitude: number | null
          availability_status: string
          company_id: string
          created_at: string
          employee_id: string
          expected_clock_in_time: string
          id: string
          license_expiry: string | null
          license_number: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          approved_latitude?: number | null
          approved_longitude?: number | null
          availability_status?: string
          company_id: string
          created_at?: string
          employee_id: string
          expected_clock_in_time?: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          approved_latitude?: number | null
          approved_longitude?: number | null
          availability_status?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          expected_clock_in_time?: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_certificates: {
        Row: {
          cert_name: string
          cert_number: string | null
          cert_type: string
          company_id: string
          created_at: string
          document_id: string | null
          employee_id: string
          expiry_date: string | null
          id: string
          issued_date: string | null
        }
        Insert: {
          cert_name: string
          cert_number?: string | null
          cert_type?: string
          company_id: string
          created_at?: string
          document_id?: string | null
          employee_id: string
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
        }
        Update: {
          cert_name?: string
          cert_number?: string | null
          cert_type?: string
          company_id?: string
          created_at?: string
          document_id?: string | null
          employee_id?: string
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_certificates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_certificates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_private_details: {
        Row: {
          bank_account_no: string | null
          bank_name: string | null
          company_id: string
          employee_id: string
          epf_no: string | null
          updated_at: string
        }
        Insert: {
          bank_account_no?: string | null
          bank_name?: string | null
          company_id: string
          employee_id: string
          epf_no?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_no?: string | null
          bank_name?: string | null
          company_id?: string
          employee_id?: string
          epf_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_private_details_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_private_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          department: string | null
          email: string | null
          employment_type: string
          full_name: string
          ic_passport_no: string | null
          id: string
          join_date: string | null
          phone: string | null
          position: string | null
          resign_date: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: string
          full_name: string
          ic_passport_no?: string | null
          id?: string
          join_date?: string | null
          phone?: string | null
          position?: string | null
          resign_date?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string | null
          employment_type?: string
          full_name?: string
          ic_passport_no?: string | null
          id?: string
          join_date?: string | null
          phone?: string | null
          position?: string | null
          resign_date?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          total_quantity: number
          unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          total_quantity?: number
          unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          total_quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_costing: {
        Row: {
          catering_event_id: string
          company_id: string
          equipment_cost: number
          food_cost: number
          id: string
          ingredient_cost: number
          notes: string | null
          other_cost: number
          staff_cost: number
          transport_cost: number
          updated_at: string
        }
        Insert: {
          catering_event_id: string
          company_id: string
          equipment_cost?: number
          food_cost?: number
          id?: string
          ingredient_cost?: number
          notes?: string | null
          other_cost?: number
          staff_cost?: number
          transport_cost?: number
          updated_at?: string
        }
        Update: {
          catering_event_id?: string
          company_id?: string
          equipment_cost?: number
          food_cost?: number
          id?: string
          ingredient_cost?: number
          notes?: string | null
          other_cost?: number
          staff_cost?: number
          transport_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_costing_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: true
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_costing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_equipment: {
        Row: {
          catering_event_id: string
          company_id: string
          created_at: string
          equipment_id: string
          id: string
          quantity_needed: number
        }
        Insert: {
          catering_event_id: string
          company_id: string
          created_at?: string
          equipment_id: string
          id?: string
          quantity_needed?: number
        }
        Update: {
          catering_event_id?: string
          company_id?: string
          created_at?: string
          equipment_id?: string
          id?: string
          quantity_needed?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_equipment_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff: {
        Row: {
          catering_event_id: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          role: string
        }
        Insert: {
          catering_event_id: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          role?: string
        }
        Update: {
          catering_event_id?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          department: string | null
          document_id: string | null
          expense_date: string
          id: string
          notes: string | null
        }
        Insert: {
          amount: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          document_id?: string | null
          expense_date: string
          id?: string
          notes?: string | null
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          document_id?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          current_stock_qty: number
          id: string
          name: string
          preferred_supplier_id: string | null
          reorder_level: number
          unit_cost: number
          unit_of_measure: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          current_stock_qty?: number
          id?: string
          name: string
          preferred_supplier_id?: string | null
          reorder_level?: number
          unit_cost?: number
          unit_of_measure?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          current_stock_qty?: number
          id?: string
          name?: string
          preferred_supplier_id?: string | null
          reorder_level?: number
          unit_cost?: number
          unit_of_measure?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_preferred_supplier_id_fkey"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campaign_id: string | null
          company_id: string
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string
          status: string
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approval_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          days: number
          document_id: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          start_date: string
          status: string
        }
        Insert: {
          approval_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          days: number
          document_id?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          start_date: string
          status?: string
        }
        Update: {
          approval_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          days?: number
          document_id?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_expenses: {
        Row: {
          amount: number
          campaign_id: string | null
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_id: string | null
          expense_date: string
          id: string
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          category?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          document_id?: string | null
          expense_date: string
          id?: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          document_id?: string | null
          expense_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_expenses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          company_id: string
          created_at: string
          id: string
          menu_id: string
          name: string
          price_per_pax: number | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          id?: string
          menu_id: string
          name: string
          price_per_pax?: number | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          menu_id?: string
          name?: string
          price_per_pax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_plan_categories: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_plan_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_plan_dishes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          meal_id: string
          name: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          meal_id: string
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          meal_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_plan_dishes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_plan_dishes_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "menu_plan_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_plan_ingredients: {
        Row: {
          base_pax: number
          base_quantity: number | null
          company_id: string
          created_at: string
          dish_id: string
          id: string
          name: string
          reference_pax: number | null
          reference_quantity: number | null
          remark: string | null
          sort_order: number
          unit: string | null
        }
        Insert: {
          base_pax: number
          base_quantity?: number | null
          company_id: string
          created_at?: string
          dish_id: string
          id?: string
          name: string
          reference_pax?: number | null
          reference_quantity?: number | null
          remark?: string | null
          sort_order?: number
          unit?: string | null
        }
        Update: {
          base_pax?: number
          base_quantity?: number | null
          company_id?: string
          created_at?: string
          dish_id?: string
          id?: string
          name?: string
          reference_pax?: number | null
          reference_quantity?: number | null
          remark?: string | null
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_plan_ingredients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_plan_ingredients_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "menu_plan_dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_plan_meals: {
        Row: {
          company_id: string
          created_at: string
          id: string
          meal_time: string
          week_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          meal_time: string
          week_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          meal_time?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_plan_meals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_plan_meals_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "menu_plan_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_plan_weeks: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          id: string
          week_number: number
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          id?: string
          week_number: number
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_plan_weeks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_plan_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_plan_weeks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_sales: {
        Row: {
          company_id: string
          id: string
          month: number
          notes: string | null
          sales_amount: number
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          company_id: string
          id?: string
          month: number
          notes?: string | null
          sales_amount: number
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          company_id?: string
          id?: string
          month?: number
          notes?: string | null
          sales_amount?: number
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_records: {
        Row: {
          approval_id: string | null
          approved_hours: number | null
          company_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          employee_id: string
          exceeds_limit: boolean
          hours: number
          id: string
          manager_remarks: string | null
          normal_working_hours: number | null
          ot_end_time: string | null
          ot_start_time: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          work_date: string
        }
        Insert: {
          approval_id?: string | null
          approved_hours?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id: string
          exceeds_limit?: boolean
          hours: number
          id?: string
          manager_remarks?: string | null
          normal_working_hours?: number | null
          ot_end_time?: string | null
          ot_start_time?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          work_date: string
        }
        Update: {
          approval_id?: string | null
          approved_hours?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          employee_id?: string
          exceeds_limit?: boolean
          hours?: number
          id?: string
          manager_remarks?: string | null
          normal_working_hours?: number | null
          ot_end_time?: string | null
          ot_start_time?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_records_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_menu_items: {
        Row: {
          company_id: string
          id: string
          item_name: string
          meal_type: string
          package_menu_id: string
          sort_order: number
        }
        Insert: {
          company_id: string
          id?: string
          item_name: string
          meal_type: string
          package_menu_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          id?: string
          item_name?: string
          meal_type?: string
          package_menu_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_menu_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_menu_items_package_menu_id_fkey"
            columns: ["package_menu_id"]
            isOneToOne: false
            referencedRelation: "package_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      package_menus: {
        Row: {
          company_id: string
          created_at: string
          id: string
          included_items: string | null
          is_active: boolean
          minimum_pax: number
          name: string
          price_per_pax: number
          special_requirements: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          included_items?: string | null
          is_active?: boolean
          minimum_pax?: number
          name: string
          price_per_pax?: number
          special_requirements?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          included_items?: string | null
          is_active?: boolean
          minimum_pax?: number
          name?: string
          price_per_pax?: number
          special_requirements?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_menus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          company_id: string
          created_at: string
          deductions: number
          employee_id: string
          gross_pay: number
          id: string
          net_pay: number
          pay_period_end: string
          pay_period_start: string
          payslip_document_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deductions?: number
          employee_id: string
          gross_pay: number
          id?: string
          net_pay: number
          pay_period_end: string
          pay_period_start: string
          payslip_document_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deductions?: number
          employee_id?: string
          gross_pay?: number
          id?: string
          net_pay?: number
          pay_period_end?: string
          pay_period_start?: string
          payslip_document_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_payslip_document_id_fkey"
            columns: ["payslip_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_transactions: {
        Row: {
          amount: number
          category: string | null
          claimant_department: string | null
          claimant_employee_id: string | null
          claimant_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          document_id: string | null
          id: string
          paid_by: string | null
          payment_date: string | null
          payment_reference: string | null
          payment_remarks: string | null
          payment_status: string
          transaction_date: string
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          claimant_department?: string | null
          claimant_employee_id?: string | null
          claimant_name?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          paid_by?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          payment_remarks?: string | null
          payment_status?: string
          transaction_date: string
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          claimant_department?: string | null
          claimant_employee_id?: string | null
          claimant_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          paid_by?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          payment_remarks?: string | null
          payment_status?: string
          transaction_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_transactions_claimant_employee_id_fkey"
            columns: ["claimant_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_requests: {
        Row: {
          approval_id: string | null
          company_id: string
          created_at: string
          department: string | null
          estimated_cost: number | null
          id: string
          item_name: string
          purchase_order_id: string | null
          quantity: number
          reason: string | null
          requester_id: string | null
          status: string
        }
        Insert: {
          approval_id?: string | null
          company_id: string
          created_at?: string
          department?: string | null
          estimated_cost?: number | null
          id?: string
          item_name: string
          purchase_order_id?: string | null
          quantity?: number
          reason?: string | null
          requester_id?: string | null
          status?: string
        }
        Update: {
          approval_id?: string | null
          company_id?: string
          created_at?: string
          department?: string | null
          estimated_cost?: number | null
          id?: string
          item_name?: string
          purchase_order_id?: string | null
          quantity?: number
          reason?: string | null
          requester_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requests_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requests_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          assigned_staff: string | null
          catering_event_id: string | null
          company_id: string
          created_at: string
          id: string
          menu_plan_dish_id: string | null
          notes: string | null
          pax_count: number | null
          planned_date: string | null
          prep_time_minutes: number | null
          recipe_id: string | null
          status: string
        }
        Insert: {
          assigned_staff?: string | null
          catering_event_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          menu_plan_dish_id?: string | null
          notes?: string | null
          pax_count?: number | null
          planned_date?: string | null
          prep_time_minutes?: number | null
          recipe_id?: string | null
          status?: string
        }
        Update: {
          assigned_staff?: string | null
          catering_event_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          menu_plan_dish_id?: string | null
          notes?: string | null
          pax_count?: number | null
          planned_date?: string | null
          prep_time_minutes?: number | null
          recipe_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_menu_plan_dish_id_fkey"
            columns: ["menu_plan_dish_id"]
            isOneToOne: false
            referencedRelation: "menu_plan_dishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          username?: string | null
        }
        Relationships: []
      }
      promotions: {
        Row: {
          campaign_id: string | null
          code: string | null
          company_id: string
          created_at: string
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          start_date: string
          status: string
          title: string
        }
        Insert: {
          campaign_id?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          discount_type?: string
          discount_value: number
          end_date: string
          id?: string
          start_date: string
          status?: string
          title: string
        }
        Update: {
          campaign_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          item_name: string
          line_total: number
          purchase_order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          item_name: string
          line_total: number
          purchase_order_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          item_name?: string
          line_total?: number
          purchase_order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          order_date: string
          po_number: string
          status: string
          supplier_id: string
          total_amount: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_date: string
          po_number: string
          status?: string
          supplier_id: string
          total_amount?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_date?: string
          po_number?: string
          status?: string
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          ingredient_id: string
          notes: string | null
          production_order_id: string | null
          quantity_requested: number
          required_date: string | null
          status: string
          supplier_id: string | null
          unit: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          ingredient_id: string
          notes?: string | null
          production_order_id?: string | null
          quantity_requested: number
          required_date?: string | null
          status?: string
          supplier_id?: string | null
          unit?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          ingredient_id?: string
          notes?: string | null
          production_order_id?: string | null
          quantity_requested?: number
          required_date?: string | null
          status?: string
          supplier_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          discount_percent: number
          id: string
          item_name: string
          line_total: number
          quantity: number
          quotation_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          discount_percent?: number
          id?: string
          item_name: string
          line_total: number
          quantity?: number
          quotation_id: string
          sort_order?: number
          unit_price: number
        }
        Update: {
          discount_percent?: number
          id?: string
          item_name?: string
          line_total?: number
          quantity?: number
          quotation_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          catering_event_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: string
          quotation_number: string
          status: string
          total_amount: number
        }
        Insert: {
          catering_event_id: string
          company_id: string
          created_at?: string
          id?: string
          payment_status?: string
          quotation_number: string
          status?: string
          total_amount?: number
        }
        Update: {
          catering_event_id?: string
          company_id?: string
          created_at?: string
          id?: string
          payment_status?: string
          quotation_number?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_catering_event_id_fkey"
            columns: ["catering_event_id"]
            isOneToOne: false
            referencedRelation: "catering_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          quantity_per_yield: number
          recipe_id: string
          unit: string | null
        }
        Insert: {
          id?: string
          ingredient_id: string
          quantity_per_yield: number
          recipe_id: string
          unit?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string
          quantity_per_yield?: number
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instructions: string | null
          menu_item_id: string | null
          name: string
          yield_pax: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instructions?: string | null
          menu_item_id?: string | null
          name: string
          yield_pax?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instructions?: string | null
          menu_item_id?: string | null
          name?: string
          yield_pax?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          ingredient_id: string
          movement_type: string
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          ingredient_id: string
          movement_type: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          ingredient_id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_items: {
        Row: {
          id: string
          item_name: string
          line_total: number
          quantity: number
          supplier_invoice_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          item_name: string
          line_total: number
          quantity?: number
          supplier_invoice_id: string
          unit_price: number
        }
        Update: {
          id?: string
          item_name?: string
          line_total?: number
          quantity?: number
          supplier_invoice_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          department: string | null
          document_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          purchase_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          department?: string | null
          document_id?: string | null
          due_date: string
          id?: string
          invoice_date: string
          invoice_number: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          department?: string | null
          document_id?: string | null
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          purchase_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          approval_id: string | null
          company_id: string
          created_at: string
          id: string
          payment_date: string | null
          payment_method: string | null
          receipt_document_id: string | null
          reference_number: string | null
          requested_by: string | null
          status: string
          supplier_invoice_id: string
        }
        Insert: {
          amount: number
          approval_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          payment_date?: string | null
          payment_method?: string | null
          receipt_document_id?: string | null
          reference_number?: string | null
          requested_by?: string | null
          status?: string
          supplier_invoice_id: string
        }
        Update: {
          amount?: number
          approval_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          payment_date?: string | null
          payment_method?: string | null
          receipt_document_id?: string | null
          reference_number?: string | null
          requested_by?: string | null
          status?: string
          supplier_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_receipt_document_id_fkey"
            columns: ["receipt_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          category: string | null
          company_id: string
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          payment_terms: string | null
          phone: string | null
          status: string
        }
        Insert: {
          category?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          payment_terms?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          payment_terms?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_log: {
        Row: {
          action: string
          company_id: string
          created_at: string
          id: string
          new_value: string | null
          performed_by: string | null
          previous_value: string | null
          reason: string | null
          related_id: string
          related_table: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          id?: string
          new_value?: string | null
          performed_by?: string | null
          previous_value?: string | null
          reason?: string | null
          related_id: string
          related_table: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          id?: string
          new_value?: string | null
          performed_by?: string | null
          previous_value?: string | null
          reason?: string | null
          related_id?: string
          related_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_proofs: {
        Row: {
          company_id: string
          created_at: string
          document_id: string
          id: string
          proof_type: string
          related_id: string
          related_table: string
          remarks: string | null
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          document_id: string
          id?: string
          proof_type?: string
          related_id: string
          related_table: string
          remarks?: string | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          document_id?: string
          id?: string
          proof_type?: string
          related_id?: string
          related_table?: string
          remarks?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_proofs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_proofs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_access: {
        Row: {
          company_id: string | null
          granted_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          granted_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          granted_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_company_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_records: {
        Row: {
          company_id: string
          cost: number
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          next_service_date: string | null
          notes: string | null
          service_date: string
          vehicle_id: string
        }
        Insert: {
          company_id: string
          cost?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          next_service_date?: string | null
          notes?: string | null
          service_date: string
          vehicle_id: string
        }
        Update: {
          company_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          next_service_date?: string | null
          notes?: string | null
          service_date?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          insurance_expiry: string | null
          next_maintenance_due: string | null
          plate_number: string
          road_tax_expiry: string | null
          status: string
          vehicle_type: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          insurance_expiry?: string | null
          next_maintenance_due?: string | null
          plate_number: string
          road_tax_expiry?: string | null
          status?: string
          vehicle_type?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          insurance_expiry?: string | null
          next_maintenance_due?: string | null
          plate_number?: string
          road_tax_expiry?: string | null
          status?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_is_super_admin: { Args: never; Returns: boolean }
      user_has_company_access: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      user_is_company_admin: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      user_is_ot_manager: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      user_owns_employee: {
        Args: { target_employee_id: string }
        Returns: boolean
      }
    }
    Enums: {
      event_status:
        | "enquiry"
        | "quoted"
        | "confirmed"
        | "in_production"
        | "delivered"
        | "completed"
        | "cancelled"
      invoice_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "paid"
        | "overdue"
        | "disputed"
        | "issued"
        | "partially_paid"
      user_role: "super_admin" | "company_admin" | "dept_manager" | "staff"
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
      event_status: [
        "enquiry",
        "quoted",
        "confirmed",
        "in_production",
        "delivered",
        "completed",
        "cancelled",
      ],
      invoice_status: [
        "draft",
        "pending_review",
        "approved",
        "paid",
        "overdue",
        "disputed",
        "issued",
        "partially_paid",
      ],
      user_role: ["super_admin", "company_admin", "dept_manager", "staff"],
    },
  },
} as const
