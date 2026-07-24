-- BASELINE — represents the ART production schema as of 2026-07-24.
-- Production was migrated to this schema manually (additive ALTER/CREATE) and
-- this baseline is already recorded as applied in drizzle.__drizzle_migrations,
-- so `drizzle-kit migrate` will NOT re-run it against production.
-- Future schema changes: edit src/lib/db/schema.ts and `drizzle-kit generate`
-- to produce incremental migrations (0001+).

CREATE TABLE "analysis_result" (
	"id" serial PRIMARY KEY NOT NULL,
	"measurement_header_id" integer NOT NULL,
	"engine_version" text DEFAULT '' NOT NULL,
	"params_json" text DEFAULT '{}' NOT NULL,
	"result_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"entra_oid" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"timing_code" text DEFAULT '' NOT NULL,
	"growth_stage" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_actual" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"timing_code" text DEFAULT '' NOT NULL,
	"actual_date" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"input_hash" text DEFAULT '' NOT NULL,
	"document_ref" text DEFAULT '' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now(),
	"first_check_by_id" integer,
	"first_check_at" timestamp,
	"assigned_approver_id" integer,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"return_reason" text DEFAULT '' NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"printed_at" timestamp,
	"superseded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "application_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"planned_date" text DEFAULT '' NOT NULL,
	"actual_date" text DEFAULT '' NOT NULL,
	"actual_start_time" text DEFAULT '' NOT NULL,
	"actual_end_time" text DEFAULT '' NOT NULL,
	"planning_status" text DEFAULT 'planned' NOT NULL,
	"execution_status" text DEFAULT 'pending' NOT NULL,
	"evidence_status" text DEFAULT 'not_required' NOT NULL,
	"decision_required" boolean DEFAULT false NOT NULL,
	"created_from" text DEFAULT 'generated' NOT NULL,
	"reschedule_reason" text DEFAULT '' NOT NULL,
	"operator" text DEFAULT '' NOT NULL,
	"sprayer" text DEFAULT '' NOT NULL,
	"forecast_snapshot" jsonb,
	"actual_weather" jsonb,
	"pre_checks" jsonb,
	"completion_notes" text DEFAULT '' NOT NULL,
	"amend_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer,
	"protocol_id" integer,
	"ts" timestamp DEFAULT now(),
	"actor" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '{}' NOT NULL,
	"document_version" integer,
	"reason" text DEFAULT '' NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "event_occurrence" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"treatment_id" integer NOT NULL,
	"planned_rate_value" real,
	"planned_rate_unit" text DEFAULT '' NOT NULL,
	"planned_override_reason" text DEFAULT '' NOT NULL,
	"actual_rate_value" real,
	"actual_rate_unit" text DEFAULT '' NOT NULL,
	"deviation_reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"sub_mix_index" integer DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'rule' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"document_id" integer,
	"blob_key" text DEFAULT '' NOT NULL,
	"blob_url" text DEFAULT '' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"evidence_type" text DEFAULT 'signed_application' NOT NULL,
	"uploaded_by_id" integer,
	"uploaded_at" timestamp DEFAULT now(),
	"replaced_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "library_term" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"crops" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_def" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"part_measured" text DEFAULT '' NOT NULL,
	"measurement_type" text DEFAULT '' NOT NULL,
	"measurement_unit" text DEFAULT '' NOT NULL,
	"application_ref" text DEFAULT '' NOT NULL,
	"days_after" integer,
	"timing" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"analyze" boolean DEFAULT true NOT NULL,
	"subsamples" integer DEFAULT 1 NOT NULL,
	"formula" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_header" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"part_measured" text DEFAULT '' NOT NULL,
	"measurement_type" text DEFAULT '' NOT NULL,
	"measurement_unit" text DEFAULT '' NOT NULL,
	"application_ref" text DEFAULT '' NOT NULL,
	"days_after" integer,
	"timing" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'site' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"analyze" boolean DEFAULT true NOT NULL,
	"subsamples" integer DEFAULT 1 NOT NULL,
	"formula" text DEFAULT '' NOT NULL,
	"measurement_date" text DEFAULT '' NOT NULL,
	"assessed_by" text DEFAULT '' NOT NULL,
	"growth_stage" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_value" (
	"measurement_header_id" integer NOT NULL,
	"plot_id" integer NOT NULL,
	"subsample" integer DEFAULT 1 NOT NULL,
	"value" real,
	CONSTRAINT "measurement_value_measurement_header_id_plot_id_subsample_pk" PRIMARY KEY("measurement_header_id","plot_id","subsample")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"payload_json" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plot" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"plot_number" integer NOT NULL,
	"rep" integer NOT NULL,
	"block" integer DEFAULT 0 NOT NULL,
	"treatment_id" integer NOT NULL,
	"map_row" integer NOT NULL,
	"map_col" integer NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclude_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"mapp_number" text DEFAULT '' NOT NULL,
	"formulation_type" text DEFAULT '' NOT NULL,
	"physical_form" text DEFAULT 'liquid' NOT NULL,
	"default_rate_value" real,
	"default_rate_unit" text DEFAULT 'L/ha' NOT NULL,
	"min_rate_value" real,
	"max_rate_value" real,
	"default_water_vol_l_per_ha" real,
	"manufacturer" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" serial PRIMARY KEY NOT NULL,
	"trial_id" integer NOT NULL,
	"scope" text DEFAULT 'trial' NOT NULL,
	"scope_ref" text DEFAULT '' NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"value" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_uid" text DEFAULT '' NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"crop" text DEFAULT '' NOT NULL,
	"target_pest" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"investigator" text DEFAULT '' NOT NULL,
	"season" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"design" text DEFAULT 'RCB' NOT NULL,
	"replicates" integer DEFAULT 4 NOT NULL,
	"block_size" integer DEFAULT 2 NOT NULL,
	"plot_width" real DEFAULT 0 NOT NULL,
	"plot_length" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "treatment" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"number" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"is_check" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "treatment_application" (
	"id" serial PRIMARY KEY NOT NULL,
	"treatment_id" integer NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"application_ref" text DEFAULT '' NOT NULL,
	"product" text DEFAULT '' NOT NULL,
	"rate" text DEFAULT '' NOT NULL,
	"rate_unit" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_component" (
	"id" serial PRIMARY KEY NOT NULL,
	"treatment_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"rate_value" real,
	"rate_unit" text DEFAULT 'L/ha' NOT NULL,
	"rate_out_of_range_reason" text DEFAULT '' NOT NULL,
	"water_volume_l_per_ha" real,
	"water_in" boolean DEFAULT false NOT NULL,
	"in_tank_mix" boolean DEFAULT true NOT NULL,
	"schedule_rule" jsonb DEFAULT '{"type":"once"}'::jsonb NOT NULL,
	"active_from" text DEFAULT '' NOT NULL,
	"active_until" text DEFAULT '' NOT NULL,
	"max_occurrences" integer,
	"from_occurrence" integer,
	"group_name" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "treatment_mix" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"treatment_id" integer NOT NULL,
	"water_volume_l_per_ha" real,
	"overage_enabled" boolean DEFAULT false NOT NULL,
	"overage_pct" real DEFAULT 0 NOT NULL,
	"water_in" boolean DEFAULT false NOT NULL,
	"sprayer" text DEFAULT '' NOT NULL,
	"tank_mix_status" text DEFAULT 'unconfirmed' NOT NULL,
	"tank_mix_notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trial" (
	"id" serial PRIMARY KEY NOT NULL,
	"protocol_id" integer NOT NULL,
	"plot_rows" integer DEFAULT 0 NOT NULL,
	"plot_cols" integer DEFAULT 0 NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"site_name" text DEFAULT '' NOT NULL,
	"operator" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"planting_date" text DEFAULT '' NOT NULL,
	"trial_notes" text DEFAULT '' NOT NULL,
	"layout_locked_at" text DEFAULT '' NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"funded_application_count" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_measurement_header_id_measurement_header_id_fk" FOREIGN KEY ("measurement_header_id") REFERENCES "public"."measurement_header"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_actual" ADD CONSTRAINT "application_actual_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_event_id_application_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_created_by_id_app_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_first_check_by_id_app_user_id_fk" FOREIGN KEY ("first_check_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_assigned_approver_id_app_user_id_fk" FOREIGN KEY ("assigned_approver_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_document" ADD CONSTRAINT "application_document_approved_by_id_app_user_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrence" ADD CONSTRAINT "event_occurrence_event_id_application_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrence" ADD CONSTRAINT "event_occurrence_component_id_treatment_component_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."treatment_component"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_occurrence" ADD CONSTRAINT "event_occurrence_treatment_id_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_file" ADD CONSTRAINT "evidence_file_event_id_application_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_file" ADD CONSTRAINT "evidence_file_document_id_application_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."application_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_file" ADD CONSTRAINT "evidence_file_uploaded_by_id_app_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_def" ADD CONSTRAINT "measurement_def_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_header" ADD CONSTRAINT "measurement_header_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_value" ADD CONSTRAINT "measurement_value_measurement_header_id_measurement_header_id_fk" FOREIGN KEY ("measurement_header_id") REFERENCES "public"."measurement_header"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_value" ADD CONSTRAINT "measurement_value_plot_id_plot_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot" ADD CONSTRAINT "plot_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot" ADD CONSTRAINT "plot_treatment_id_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_trial_id_trial_id_fk" FOREIGN KEY ("trial_id") REFERENCES "public"."trial"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_application" ADD CONSTRAINT "treatment_application_treatment_id_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_component" ADD CONSTRAINT "treatment_component_treatment_id_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_component" ADD CONSTRAINT "treatment_component_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_mix" ADD CONSTRAINT "treatment_mix_event_id_application_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."application_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_mix" ADD CONSTRAINT "treatment_mix_treatment_id_treatment_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial" ADD CONSTRAINT "trial_protocol_id_protocol_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."protocol"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "appactual_trial_code" ON "application_actual" USING btree ("trial_id","timing_code");--> statement-breakpoint
CREATE UNIQUE INDEX "appdoc_event_version" ON "application_document" USING btree ("event_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "appdoc_ref" ON "application_document" USING btree ("document_ref");--> statement-breakpoint
CREATE INDEX "idx_appdoc_event" ON "application_document" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appevent_trial_seq" ON "application_event" USING btree ("trial_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_appevent_trial" ON "application_event" USING btree ("trial_id");--> statement-breakpoint
CREATE INDEX "idx_occurrence_event" ON "event_occurrence" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_event" ON "evidence_file" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "libterm_cat_val" ON "library_term" USING btree ("category","value");--> statement-breakpoint
CREATE INDEX "idx_header_trial" ON "measurement_header" USING btree ("trial_id");--> statement-breakpoint
CREATE INDEX "idx_notification_user" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plot_trial_number" ON "plot" USING btree ("trial_id","plot_number");--> statement-breakpoint
CREATE INDEX "idx_plot_trial" ON "plot" USING btree ("trial_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_name" ON "product" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_property_scope" ON "property" USING btree ("scope","scope_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_proto_num" ON "treatment" USING btree ("protocol_id","number");--> statement-breakpoint
CREATE INDEX "idx_trtappl_treatment" ON "treatment_application" USING btree ("treatment_id");--> statement-breakpoint
CREATE INDEX "idx_component_treatment" ON "treatment_component" USING btree ("treatment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mix_event_treatment" ON "treatment_mix" USING btree ("event_id","treatment_id");