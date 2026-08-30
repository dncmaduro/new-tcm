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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          profile_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          profile_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_activity_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_attachments: {
        Row: {
          comment_id: string | null
          created_at: string
          created_by: string
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          created_by: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body_json: Json
          body_text: string
          created_at: string
          created_by: string
          deleted_at: string | null
          goal_id: string | null
          id: string
          key_result_id: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          body_json: Json
          body_text: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          goal_id?: string | null
          id?: string
          key_result_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          body_json?: Json
          body_text?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          goal_id?: string | null
          id?: string
          key_result_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          parent_department_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_check_ins: {
        Row: {
          comment: string | null
          created_at: string | null
          goal_id: string
          id: string
          profile_id: string
          progress: number | null
          status: string | null
          week_start: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          goal_id: string
          id?: string
          profile_id: string
          progress?: number | null
          status?: string | null
          week_start: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          goal_id?: string
          id?: string
          profile_id?: string
          progress?: number | null
          status?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_goal"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_departments: {
        Row: {
          created_at: string | null
          department_id: string
          goal_id: string
          goal_weight: number | null
          kr_weight: number | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          goal_id: string
          goal_weight?: number | null
          kr_weight?: number | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          goal_id?: string
          goal_weight?: number | null
          kr_weight?: number | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_departments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_owners: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_owners_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_owners_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string | null
          department_id: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          note: string | null
          quarter: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["goal_status"] | null
          target: number | null
          type: Database["public"]["Enums"]["goal_type"] | null
          unit: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          note?: string | null
          quarter?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target?: number | null
          type?: Database["public"]["Enums"]["goal_type"] | null
          unit?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          note?: string | null
          quarter?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          target?: number | null
          type?: Database["public"]["Enums"]["goal_type"] | null
          unit?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      key_result_support_links: {
        Row: {
          allocated_percent: number | null
          allocated_value: number | null
          created_at: string
          id: string
          note: string | null
          support_key_result_id: string
          target_key_result_id: string
          updated_at: string
        }
        Insert: {
          allocated_percent?: number | null
          allocated_value?: number | null
          created_at?: string
          id?: string
          note?: string | null
          support_key_result_id: string
          target_key_result_id: string
          updated_at?: string
        }
        Update: {
          allocated_percent?: number | null
          allocated_value?: number | null
          created_at?: string
          id?: string
          note?: string | null
          support_key_result_id?: string
          target_key_result_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_result_support_links_support_key_result_id_fkey"
            columns: ["support_key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_result_support_links_target_key_result_id_fkey"
            columns: ["target_key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          contribution_type:
            | Database["public"]["Enums"]["kr_contribution_type"]
            | null
          created_at: string | null
          current: number | null
          description: string | null
          end_date: string | null
          goal_id: string
          id: string
          name: string
          responsible_department_id: string | null
          start_date: string | null
          start_value: number | null
          target: number
          type: Database["public"]["Enums"]["goal_type"] | null
          unit: Database["public"]["Enums"]["kr_unit"] | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          contribution_type?:
            | Database["public"]["Enums"]["kr_contribution_type"]
            | null
          created_at?: string | null
          current?: number | null
          description?: string | null
          end_date?: string | null
          goal_id: string
          id?: string
          name: string
          responsible_department_id?: string | null
          start_date?: string | null
          start_value?: number | null
          target: number
          type?: Database["public"]["Enums"]["goal_type"] | null
          unit?: Database["public"]["Enums"]["kr_unit"] | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          contribution_type?:
            | Database["public"]["Enums"]["kr_contribution_type"]
            | null
          created_at?: string | null
          current?: number | null
          description?: string | null
          end_date?: string | null
          goal_id?: string
          id?: string
          name?: string
          responsible_department_id?: string | null
          start_date?: string | null
          start_value?: number | null
          target?: number
          type?: Database["public"]["Enums"]["goal_type"] | null
          unit?: Database["public"]["Enums"]["kr_unit"] | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "key_results_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_responsible_department_id_fkey"
            columns: ["responsible_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string | null
          id: string
          month: string
          profile_id: string
          total_hours: number
          used_hours: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: string
          profile_id: string
          total_hours: number
          used_hours?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: string
          profile_id?: string
          total_hours?: number
          used_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_profile_id: string | null
          body: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_key: string
          href: string | null
          id: string
          is_read: boolean
          metadata: Json
          read_at: string | null
          recipient_profile_id: string
          title: string
        }
        Insert: {
          actor_profile_id?: string | null
          body?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_key: string
          href?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          recipient_profile_id: string
          title: string
        }
        Update: {
          actor_profile_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_key?: string
          href?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          recipient_profile_id?: string
          title?: string
        }
        Relationships: []
      }
      parttime_schedule_change_requests: {
        Row: {
          created_at: string
          id: string
          original_entry_id: string | null
          profile_id: string
          reason: string
          request_type: Database["public"]["Enums"]["parttime_change_type"]
          requested_shift: Database["public"]["Enums"]["parttime_shift"] | null
          requested_work_date: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_comment: string | null
          schedule_id: string
          status: Database["public"]["Enums"]["parttime_change_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_entry_id?: string | null
          profile_id: string
          reason: string
          request_type: Database["public"]["Enums"]["parttime_change_type"]
          requested_shift?: Database["public"]["Enums"]["parttime_shift"] | null
          requested_work_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          schedule_id: string
          status?: Database["public"]["Enums"]["parttime_change_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          original_entry_id?: string | null
          profile_id?: string
          reason?: string
          request_type?: Database["public"]["Enums"]["parttime_change_type"]
          requested_shift?: Database["public"]["Enums"]["parttime_shift"] | null
          requested_work_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          schedule_id?: string
          status?: Database["public"]["Enums"]["parttime_change_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parttime_change_requests_original_entry_fkey"
            columns: ["original_entry_id"]
            isOneToOne: false
            referencedRelation: "parttime_schedule_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_change_requests_profile_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_change_requests_schedule_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "parttime_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      parttime_schedule_entries: {
        Row: {
          change_request_id: string | null
          created_at: string
          id: string
          is_active: boolean
          profile_id: string
          removed_at: string | null
          removed_by: string | null
          schedule_id: string
          shift: Database["public"]["Enums"]["parttime_shift"]
          updated_at: string
          work_date: string
        }
        Insert: {
          change_request_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          profile_id: string
          removed_at?: string | null
          removed_by?: string | null
          schedule_id: string
          shift: Database["public"]["Enums"]["parttime_shift"]
          updated_at?: string
          work_date: string
        }
        Update: {
          change_request_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          profile_id?: string
          removed_at?: string | null
          removed_by?: string | null
          schedule_id?: string
          shift?: Database["public"]["Enums"]["parttime_shift"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "parttime_schedule_entries_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "parttime_schedule_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_schedule_entries_profile_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_schedule_entries_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_schedule_entries_schedule_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "parttime_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      parttime_schedules: {
        Row: {
          created_at: string
          created_by: string
          department_id: string
          finalized_at: string | null
          finalized_automatically: boolean
          finalized_by: string | null
          id: string
          status: Database["public"]["Enums"]["parttime_schedule_status"]
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department_id: string
          finalized_at?: string | null
          finalized_automatically?: boolean
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["parttime_schedule_status"]
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department_id?: string
          finalized_at?: string | null
          finalized_automatically?: boolean
          finalized_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["parttime_schedule_status"]
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "parttime_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_schedules_department_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parttime_schedules_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_report_items: {
        Row: {
          created_at: string
          current_value: number | null
          id: string
          item_type: Database["public"]["Enums"]["performance_report_item_type"]
          meta_json: Json | null
          name: string
          performance_report_id: string
          progress_percent: number | null
          reference_id: string | null
          score: number | null
          target_value: number | null
          unit: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          current_value?: number | null
          id?: string
          item_type: Database["public"]["Enums"]["performance_report_item_type"]
          meta_json?: Json | null
          name: string
          performance_report_id: string
          progress_percent?: number | null
          reference_id?: string | null
          score?: number | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          current_value?: number | null
          id?: string
          item_type?: Database["public"]["Enums"]["performance_report_item_type"]
          meta_json?: Json | null
          name?: string
          performance_report_id?: string
          progress_percent?: number | null
          reference_id?: string | null
          score?: number | null
          target_value?: number | null
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_report_items_performance_report_id_fkey"
            columns: ["performance_report_id"]
            isOneToOne: false
            referencedRelation: "performance_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reports: {
        Row: {
          business_score: number | null
          completed_task_count: number
          completed_task_points: number
          created_at: string
          created_by: string | null
          department_id: string | null
          direct_kr_count: number
          execution_score: number | null
          goal_count: number
          id: string
          manager_comment: string | null
          overall_score: number | null
          overdue_task_count: number
          period_end: string
          period_key: string
          period_start: string
          period_type: Database["public"]["Enums"]["performance_report_period_type"]
          profile_id: string
          reviewed_by: string | null
          self_comment: string | null
          status: Database["public"]["Enums"]["performance_report_status"]
          support_kr_count: number
          support_score: number | null
          task_count: number
          total_task_points: number
          updated_at: string
        }
        Insert: {
          business_score?: number | null
          completed_task_count?: number
          completed_task_points?: number
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          direct_kr_count?: number
          execution_score?: number | null
          goal_count?: number
          id?: string
          manager_comment?: string | null
          overall_score?: number | null
          overdue_task_count?: number
          period_end: string
          period_key: string
          period_start: string
          period_type: Database["public"]["Enums"]["performance_report_period_type"]
          profile_id: string
          reviewed_by?: string | null
          self_comment?: string | null
          status?: Database["public"]["Enums"]["performance_report_status"]
          support_kr_count?: number
          support_score?: number | null
          task_count?: number
          total_task_points?: number
          updated_at?: string
        }
        Update: {
          business_score?: number | null
          completed_task_count?: number
          completed_task_points?: number
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          direct_kr_count?: number
          execution_score?: number | null
          goal_count?: number
          id?: string
          manager_comment?: string | null
          overall_score?: number | null
          overdue_task_count?: number
          period_end?: string
          period_key?: string
          period_start?: string
          period_type?: Database["public"]["Enums"]["performance_report_period_type"]
          profile_id?: string
          reviewed_by?: string | null
          self_comment?: string | null
          status?: Database["public"]["Enums"]["performance_report_status"]
          support_kr_count?: number
          support_score?: number | null
          task_count?: number
          total_task_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          attendance_id: number | null
          avatar: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean
          is_parttime: boolean
          is_timekeeping_enabled: boolean
          join_at: string | null
          leave_at: string | null
          name: string | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attendance_id?: number | null
          avatar?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_parttime?: boolean
          is_timekeeping_enabled?: boolean
          join_at?: string | null
          leave_at?: string | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attendance_id?: number | null
          avatar?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_parttime?: boolean
          is_timekeeping_enabled?: boolean
          join_at?: string | null
          leave_at?: string | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      task_evidences: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          evidence_type: Database["public"]["Enums"]["task_evidence_type"]
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          task_id: string
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          evidence_type?: Database["public"]["Enums"]["task_evidence_type"]
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          evidence_type?: Database["public"]["Enums"]["task_evidence_type"]
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          task_id?: string
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_evidences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_evidences_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          creator_profile_id: string | null
          current: number
          description: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          is_backlog: boolean
          is_recurring: boolean | null
          key_result_id: string | null
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          profile_id: string | null
          result: string | null
          start_date: string | null
          target: number
          type: Database["public"]["Enums"]["task_type"] | null
          unit: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          creator_profile_id?: string | null
          current: number
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          is_backlog?: boolean
          is_recurring?: boolean | null
          key_result_id?: string | null
          name: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          profile_id?: string | null
          result?: string | null
          start_date?: string | null
          target: number
          type?: Database["public"]["Enums"]["task_type"] | null
          unit: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          creator_profile_id?: string | null
          current?: number
          description?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          is_backlog?: boolean
          is_recurring?: boolean | null
          key_result_id?: string | null
          name?: string
          note?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          profile_id?: string | null
          result?: string | null
          start_date?: string | null
          target?: number
          type?: Database["public"]["Enums"]["task_type"] | null
          unit?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_request_reviewers: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          is_approved: boolean | null
          profile_id: string
          reviewed_at: string | null
          time_request_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          profile_id: string
          reviewed_at?: string | null
          time_request_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          profile_id?: string
          reviewed_at?: string | null
          time_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_request_reviewers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_request_reviewers_time_request_id_fkey"
            columns: ["time_request_id"]
            isOneToOne: false
            referencedRelation: "time_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      time_request_reviewer_overrides: {
        Row: {
          created_at: string
          requester_profile_id: string
          reviewer_profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          requester_profile_id: string
          reviewer_profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          requester_profile_id?: string
          reviewer_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_request_reviewer_overrides_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_request_reviewer_overrides_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_requests: {
        Row: {
          created_at: string | null
          date: string | null
          id: string
          leave_session: string | null
          leave_subtype: string | null
          minutes: number | null
          profile_id: string | null
          reason: string | null
          remote_check_in: string | null
          remote_check_out: string | null
          request_schema_version: number
          requested_hours: number | null
          short_code: string | null
          type: Database["public"]["Enums"]["new_time_request_type"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: string
          leave_session?: string | null
          leave_subtype?: string | null
          minutes?: number | null
          profile_id?: string | null
          reason?: string | null
          remote_check_in?: string | null
          remote_check_out?: string | null
          request_schema_version?: number
          requested_hours?: number | null
          short_code?: string | null
          type?: Database["public"]["Enums"]["new_time_request_type"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: string
          leave_session?: string | null
          leave_subtype?: string | null
          minutes?: number | null
          profile_id?: string | null
          reason?: string | null
          remote_check_in?: string | null
          remote_check_out?: string | null
          request_schema_version?: number
          requested_hours?: number | null
          short_code?: string | null
          type?: Database["public"]["Enums"]["new_time_request_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      times: {
        Row: {
          attendance_id: number | null
          check_in: string | null
          check_out: string | null
          created_at: string | null
          date: string
          device_id: number
          id: string
          updated_at: string | null
        }
        Insert: {
          attendance_id?: number | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          date: string
          device_id?: number
          id?: string
          updated_at?: string | null
        }
        Update: {
          attendance_id?: number | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          date?: string
          device_id?: number
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "times_attendance_id_device_id_fkey"
            columns: ["attendance_id", "device_id"]
            isOneToOne: false
            referencedRelation: "times_profiles"
            referencedColumns: ["attendance_id", "device_id"]
          },
        ]
      }
      times_profiles: {
        Row: {
          attendance_id: number | null
          created_at: string
          device_id: number
          id: string
          profile_id: string | null
        }
        Insert: {
          attendance_id?: number | null
          created_at?: string
          device_id?: number
          id?: string
          profile_id?: string | null
        }
        Update: {
          attendance_id?: number | null
          created_at?: string
          device_id?: number
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "times_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_in_department: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string
          profile_id: string | null
          role_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          profile_id?: string | null
          role_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          profile_id?: string | null
          role_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_role_in_department_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_in_department_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_in_department_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_performance_period_key: {
        Args: {
          p_period_start: string
          p_period_type: Database["public"]["Enums"]["performance_report_period_type"]
        }
        Returns: string
      }
      can_create_goal_for_department: {
        Args: { _department_id: string }
        Returns: boolean
      }
      cancel_parttime_change_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      create_app_notification: {
        Args: {
          p_actor_profile_id: string
          p_body?: string
          p_entity_id: string
          p_entity_type: string
          p_event_key: string
          p_href?: string
          p_metadata?: Json
          p_recipient_profile_id: string
          p_title: string
        }
        Returns: string
      }
      create_backlog_task: {
        Args: {
          p_description?: string
          p_name: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
        }
        Returns: {
          assignee_id: string | null
          created_at: string | null
          creator_profile_id: string | null
          current: number
          description: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          is_backlog: boolean
          is_recurring: boolean | null
          key_result_id: string | null
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          profile_id: string | null
          result: string | null
          start_date: string | null
          target: number
          type: Database["public"]["Enums"]["task_type"] | null
          unit: string
          updated_at: string | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_comment_with_mentions: {
        Args: {
          p_body_json?: Json
          p_body_text?: string
          p_goal_id?: string
          p_key_result_id?: string
          p_mentioned_profile_ids?: string[]
          p_task_id?: string
        }
        Returns: {
          body_json: Json
          body_text: string
          created_at: string
          created_by: string
          deleted_at: string | null
          goal_id: string | null
          id: string
          key_result_id: string | null
          task_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_parttime_change_request: {
        Args: {
          p_original_entry_id?: string
          p_reason: string
          p_request_type: Database["public"]["Enums"]["parttime_change_type"]
          p_requested_shift?: Database["public"]["Enums"]["parttime_shift"]
          p_requested_work_date?: string
          p_schedule_id: string
        }
        Returns: string
      }
      create_parttime_schedule: {
        Args: { p_department_id: string; p_week_start: string }
        Returns: undefined
      }
      current_activity_profile_id: { Args: never; Returns: string }
      current_actor_is_backlog_manager: { Args: never; Returns: boolean }
      current_actor_is_root_leader: { Args: never; Returns: boolean }
      current_actor_profile_ids: { Args: never; Returns: string[] }
      current_profile_id: { Args: never; Returns: string }
      ensure_leave_balance_for_month: {
        Args: { p_month: string; p_profile_id: string }
        Returns: {
          created_at: string | null
          id: string
          month: string
          profile_id: string
          total_hours: number
          used_hours: number
        }
        SetofOptions: {
          from: "*"
          to: "leave_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_leave_balance_for_profile_month: {
        Args: { p_month: string; p_profile_id: string }
        Returns: {
          created_at: string | null
          id: string
          month: string
          profile_id: string
          total_hours: number
          used_hours: number
        }
        SetofOptions: {
          from: "*"
          to: "leave_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_parttime_schedule: {
        Args: { p_schedule_id: string }
        Returns: undefined
      }
      generate_time_request_short_code: { Args: never; Returns: string }
      generate_weekly_performance_reports: {
        Args: { p_reference_at?: string; p_timezone?: string }
        Returns: undefined
      }
      get_profile_goal_count_for_period: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_profile_id: string
        }
        Returns: number
      }
      get_profile_krs_for_period: {
        Args: {
          p_contribution_type: Database["public"]["Enums"]["kr_contribution_type"]
          p_period_end: string
          p_period_start: string
          p_profile_id: string
        }
        Returns: {
          contribution_type: Database["public"]["Enums"]["kr_contribution_type"]
          current: number
          id: string
          name: string
          target: number
          unit: string
          weight: number
        }[]
      }
      get_profile_task_summary_for_period: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_profile_id: string
        }
        Returns: {
          completed_task_count: number
          overdue_task_count: number
          task_count: number
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      normalize_role_name: { Args: { input: string }; Returns: string }
      register_parttime_shift: {
        Args: {
          p_department_id: string
          p_shift: Database["public"]["Enums"]["parttime_shift"]
          p_week_start: string
          p_work_date: string
        }
        Returns: string
      }
      review_parttime_change_request: {
        Args: {
          p_approve: boolean
          p_request_id: string
          p_reviewer_comment?: string
        }
        Returns: undefined
      }
      rollover_leave_balances: {
        Args: {
          p_monthly_allowance_hours?: number
          p_monthly_cap_hours?: number
          p_reference_at?: string
          p_timezone?: string
        }
        Returns: undefined
      }
      schedule_backlog_task: {
        Args: { p_assignee_id: string; p_end_date: string; p_task_id: string }
        Returns: {
          assignee_id: string | null
          created_at: string | null
          creator_profile_id: string | null
          current: number
          description: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          is_backlog: boolean
          is_recurring: boolean | null
          key_result_id: string | null
          name: string
          note: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          profile_id: string | null
          result: string | null
          start_date: string | null
          target: number
          type: Database["public"]["Enums"]["task_type"] | null
          unit: string
          updated_at: string | null
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_leave_balance_for_month: {
        Args: {
          p_month: string
          p_monthly_allowance_hours?: number
          p_monthly_cap_hours?: number
          p_profile_id: string
        }
        Returns: {
          created_at: string | null
          id: string
          month: string
          profile_id: string
          total_hours: number
          used_hours: number
        }
        SetofOptions: {
          from: "*"
          to: "leave_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unaccent: { Args: { "": string }; Returns: string }
      unregister_parttime_shift: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
    }
    Enums: {
      goal_log_type:
        | "goal_created"
        | "goal_updated"
        | "goal_status_changed"
        | "goal_progress_updated"
        | "goal_deleted"
      goal_status: "draft" | "active" | "completed" | "cancelled"
      goal_type: "NULL" | "okr" | "kpi"
      kr_contribution_type: "direct" | "support"
      kr_unit: "percent" | "currency" | "count"
      new_time_request_type:
        | "approved_leave"
        | "unauthorized_leave"
        | "remote"
        | "overtime"
      parttime_change_status: "pending" | "approved" | "rejected" | "cancelled"
      parttime_change_type: "add" | "remove" | "replace"
      parttime_schedule_status: "open" | "finalized"
      parttime_shift: "morning" | "afternoon"
      performance_report_item_type:
        | "goal"
        | "direct_kr"
        | "support_kr"
        | "execution"
      performance_report_period_type: "weekly" | "monthly" | "quarterly"
      performance_report_status: "draft" | "submitted" | "reviewed" | "locked"
      task_evidence_type: "link" | "file" | "other"
      task_log_type:
        | "status_changed"
        | "assignee_changed"
        | "progress_updated"
        | "task_created"
        | "task_updated"
        | "task_deleted"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "doing" | "done" | "cancelled"
      task_type: "kpi" | "okr"
      time_request_type:
        | "leave_early"
        | "in_late"
        | "overtime"
        | "remote"
        | "make_up"
        | "absent"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      goal_log_type: [
        "goal_created",
        "goal_updated",
        "goal_status_changed",
        "goal_progress_updated",
        "goal_deleted",
      ],
      goal_status: ["draft", "active", "completed", "cancelled"],
      goal_type: ["NULL", "okr", "kpi"],
      kr_contribution_type: ["direct", "support"],
      kr_unit: ["percent", "currency", "count"],
      new_time_request_type: [
        "approved_leave",
        "unauthorized_leave",
        "remote",
        "overtime",
      ],
      parttime_change_status: ["pending", "approved", "rejected", "cancelled"],
      parttime_change_type: ["add", "remove", "replace"],
      parttime_schedule_status: ["open", "finalized"],
      parttime_shift: ["morning", "afternoon"],
      performance_report_item_type: [
        "goal",
        "direct_kr",
        "support_kr",
        "execution",
      ],
      performance_report_period_type: ["weekly", "monthly", "quarterly"],
      performance_report_status: ["draft", "submitted", "reviewed", "locked"],
      task_evidence_type: ["link", "file", "other"],
      task_log_type: [
        "status_changed",
        "assignee_changed",
        "progress_updated",
        "task_created",
        "task_updated",
        "task_deleted",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "doing", "done", "cancelled"],
      task_type: ["kpi", "okr"],
      time_request_type: [
        "leave_early",
        "in_late",
        "overtime",
        "remote",
        "make_up",
        "absent",
      ],
    },
  },
} as const
