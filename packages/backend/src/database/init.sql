-- AnnotateMe Database Initialization Script
-- Run this directly in PostgreSQL if needed

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('active', 'archived', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE data_type AS ENUM ('image', 'text', 'audio', 'video');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE file_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE annotation_status AS ENUM ('pending', 'in_progress', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_role AS ENUM ('viewer', 'annotator', 'manager', 'admin');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  "firstName" VARCHAR(255),
  "lastName" VARCHAR(255),
  role user_role DEFAULT 'user',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_email_not_empty CHECK (email != ''),
  CONSTRAINT users_username_not_empty CHECK (username != '')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo VARCHAR(255),
  "ownerId" UUID NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_organizations_owner ON organizations("ownerId");

-- Create user_organizations junction table
CREATE TABLE IF NOT EXISTS user_organizations (
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  PRIMARY KEY ("userId", "organizationId"),
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status project_status DEFAULT 'active',
  "dataType" data_type DEFAULT 'image',
  "labelSet" JSON DEFAULT '[]'::json,
  "totalItems" INTEGER DEFAULT 0,
  "annotatedItems" INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  "organizationId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_organization ON projects("organizationId");
CREATE INDEX idx_projects_creator ON projects("createdById");
CREATE INDEX idx_projects_status ON projects(status);

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "originalName" VARCHAR(255) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100),
  size INTEGER,
  path VARCHAR(500),
  status file_status DEFAULT 'pending',
  "projectId" UUID NOT NULL,
  "uploadedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_files_project ON files("projectId");
CREATE INDEX idx_files_status ON files(status);

-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "fileId" VARCHAR(255) NOT NULL,
  data JSON,
  notes TEXT,
  status annotation_status DEFAULT 'pending',
  confidence DECIMAL(3,2) DEFAULT 0,
  "projectId" UUID NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_annotations_project ON annotations("projectId");
CREATE INDEX idx_annotations_status ON annotations(status);
CREATE INDEX idx_annotations_created ON annotations("createdAt");

-- Create annotation_labels table
CREATE TABLE IF NOT EXISTS annotation_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label VARCHAR(255) NOT NULL,
  coordinates JSON,
  confidence DECIMAL(3,2),
  "annotationId" UUID NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("annotationId") REFERENCES annotations(id) ON DELETE CASCADE
);

CREATE INDEX idx_annotation_labels_annotation ON annotation_labels("annotationId");

-- Create collaborations table
CREATE TABLE IF NOT EXISTS collaborations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role collaboration_role DEFAULT 'viewer',
  "canEdit" BOOLEAN DEFAULT true,
  "canDelete" BOOLEAN DEFAULT false,
  "canInvite" BOOLEAN DEFAULT false,
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "joinedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("projectId", "userId"),
  FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_collaborations_project ON collaborations("projectId");
CREATE INDEX idx_collaborations_user ON collaborations("userId");

-- Create analytics table
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric VARCHAR(255) NOT NULL,
  value DECIMAL(10,2),
  details JSON,
  "projectId" UUID NOT NULL,
  "recordedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_analytics_project_metric ON analytics("projectId", metric);
CREATE INDEX idx_analytics_recorded ON analytics("recordedAt");

-- Add sample data comment
COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON TABLE organizations IS 'Multi-tenant organizations';
COMMENT ON TABLE projects IS 'Annotation projects';
COMMENT ON TABLE files IS 'Files awaiting annotation';
COMMENT ON TABLE annotations IS 'Annotation records';
COMMENT ON TABLE annotation_labels IS 'Labels within annotations';
COMMENT ON TABLE collaborations IS 'Project collaboration and permissions';
COMMENT ON TABLE analytics IS 'Project analytics and metrics';
