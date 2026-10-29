-- More kinds of company licences / registrations: MOF registration, SSM / Companies Act documents, food premises registration (FoSIM).
alter table company_documents drop constraint if exists company_documents_doc_type_check;
alter table company_documents
  add constraint company_documents_doc_type_check
  check (doc_type in ('mbjb_licence','halal_licence','tenancy_agreement','mof_registration','ssm_document','food_premises_registration','other'));
