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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      loan_approvals: {
        Row: {
          approver_id: string
          comment: string | null
          created_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          loan_id: string
          stage: Database["public"]["Enums"]["loan_stage"]
        }
        Insert: {
          approver_id: string
          comment?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          loan_id: string
          stage: Database["public"]["Enums"]["loan_stage"]
        }
        Update: {
          approver_id?: string
          comment?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          loan_id?: string
          stage?: Database["public"]["Enums"]["loan_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "loan_approvals_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          loan_id: string
          mime_type: string | null
          note: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          loan_id: string
          mime_type?: string | null
          note?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          loan_id?: string
          mime_type?: string | null
          note?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_documents_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_policies: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          interest_rate: number
          max_term_months: number
          min_membership_months: number
          min_savings: number
          notes: string | null
          savings_multiplier: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          interest_rate?: number
          max_term_months?: number
          min_membership_months?: number
          min_savings?: number
          notes?: string | null
          savings_multiplier?: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          interest_rate?: number
          max_term_months?: number
          min_membership_months?: number
          min_savings?: number
          notes?: string | null
          savings_multiplier?: number
          version?: number
        }
        Relationships: []
      }
      loans: {
        Row: {
          amount_approved: number | null
          amount_requested: number
          created_at: string
          eligibility_limit: number | null
          id: string
          interest_rate: number
          loan_number: string
          member_id: string
          outstanding_balance: number
          purpose: string
          stage: Database["public"]["Enums"]["loan_stage"]
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
        }
        Insert: {
          amount_approved?: number | null
          amount_requested: number
          created_at?: string
          eligibility_limit?: number | null
          id?: string
          interest_rate?: number
          loan_number?: string
          member_id: string
          outstanding_balance?: number
          purpose: string
          stage?: Database["public"]["Enums"]["loan_stage"]
          status?: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at?: string
        }
        Update: {
          amount_approved?: number | null
          amount_requested?: number
          created_at?: string
          eligibility_limit?: number | null
          id?: string
          interest_rate?: number
          loan_number?: string
          member_id?: string
          outstanding_balance?: number
          purpose?: string
          stage?: Database["public"]["Enums"]["loan_stage"]
          status?: Database["public"]["Enums"]["loan_status"]
          term_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: Database["public"]["Enums"]["notif_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type: Database["public"]["Enums"]["notif_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: Database["public"]["Enums"]["notif_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          joined_at: string
          member_number: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          joined_at?: string
          member_number?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          joined_at?: string
          member_number?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          tx_type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          tx_type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          tx_type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_eligibility: { Args: { _user_id: string }; Returns: Json }
      current_policy: {
        Args: never
        Returns: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          interest_rate: number
          max_term_months: number
          min_membership_months: number
          min_savings: number
          notes: string | null
          savings_multiplier: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "loan_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_active_loan_balance: { Args: { _user_id: string }; Returns: number }
      get_savings_balance: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "member" | "approver" | "finance" | "manager" | "admin"
      approval_decision:
        | "approved"
        | "rejected"
        | "forwarded"
        | "docs_requested"
      loan_stage:
        | "submitted"
        | "under_review"
        | "branch_approval"
        | "finance_approval"
        | "manager_approval"
        | "disbursement"
        | "completed"
        | "rejected"
      loan_status:
        | "pending"
        | "approved"
        | "rejected"
        | "disbursed"
        | "completed"
      notif_type:
        | "deposit"
        | "loan_update"
        | "loan_approved"
        | "loan_rejected"
        | "due_reminder"
        | "docs_requested"
        | "system"
      tx_type:
        | "deposit"
        | "withdrawal"
        | "contribution"
        | "fee"
        | "repayment"
        | "disbursement"
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
      app_role: ["member", "approver", "finance", "manager", "admin"],
      approval_decision: [
        "approved",
        "rejected",
        "forwarded",
        "docs_requested",
      ],
      loan_stage: [
        "submitted",
        "under_review",
        "branch_approval",
        "finance_approval",
        "manager_approval",
        "disbursement",
        "completed",
        "rejected",
      ],
      loan_status: [
        "pending",
        "approved",
        "rejected",
        "disbursed",
        "completed",
      ],
      notif_type: [
        "deposit",
        "loan_update",
        "loan_approved",
        "loan_rejected",
        "due_reminder",
        "docs_requested",
        "system",
      ],
      tx_type: [
        "deposit",
        "withdrawal",
        "contribution",
        "fee",
        "repayment",
        "disbursement",
      ],
    },
  },
} as const
