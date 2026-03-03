# Database setup guide

This guide will help you set up the projects table and related database features.

## 1. Install dependencies

Make sure you have the following dependencies installed:

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

## 2. Configure environment variables

Add the database connection string in the 'packages/app/.env.local' file:

```env
# Supabase DATABASE CONNECTION STRING
# FORMAT：postgresql://postgres:[password]@[host]:[port]/postgres
# You can set it up in your Supabase project > Database > Connection string 中找到
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

**Note**: Use Supabase's database connection string instead of the API URL.

## 3. Run a database migration

### Method 1: Use Supabase Dashboard (Recommended)

1. Log in to the Supabase Dashboard
2. Go to SQL Editor
3. Copy the contents of the 'lib/db/migrations/0000_create_projects.sql' file
4. Execute the SQL script in SQL Editor

### Method 2: Use Drizzle Kit (If Configured)

```bash
# Generate the migration file
pnpm drizzle-kit generate

# Application migration (database connection required)
pnpm drizzle-kit migrate
```

## 4. Use the Projects API

### Get all the items of the user

```typescript
import { getUserProjects } from '@/lib/db/projects';

const projects = await getUserProjects(userId);
```

### Create a new project

```typescript
import { createProject } from '@/lib/db/projects';

const newProject = await createProject({
  userId: 'user-id',
  name: 'My Project',
  description: 'Project Description',
});
```

### Update the project

```typescript
import { updateProject } from '@/lib/db/projects';

const updated = await updateProject(
  'project-id',
  'user-id',
  {
    name: 'updated project name',
    description: 'updated description',
  }
);
```

### 删除项目

```typescript
import { deleteProject } from '@/lib/db/projects';

const deleted = await deleteProject('project-id', 'user-id');
```

## 5. Used in API Route

Example: Create an API route to manage a project

```typescript
// app/api/projects/route.ts
import { createClient } from '@/lib/supabase/server';
import { createProject, getUserProjects } from '@/lib/db/projects';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projects = await getUserProjects(user.id);
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const project = await createProject({
    userId: user.id,
    name: body.name,
    description: body.description,
  });

  return NextResponse.json(project);
}
```

## 6. Row Level Security (RLS)

The migration file is configured with a Row Level Security policy to ensure:

- Users can only view their own projects
- Users can only create their own projects
- Users can only update their own projects
- Users can only delete their own projects

These policies are enforced at the database level, providing an additional layer of security.

## 7. Table structure

The projects table contains the following fields:

- 'id' (UUID): Primary key, automatically generated
- 'user_id' (UUID): Associated with auth.users(id), foreign key constraints
- 'name' (TEXT): The name of the project, required
- 'description' (TEXT): Optional project description
- 'created_at' (TIMESTAMP): Create a time, set automatically
- 'updated_at' (TIMESTAMP): Update time, automatic update

## Troubleshooting

### Connection error

- Ensure that the 'DATABASE_URL' environment variable is set correctly
- Check that the database connection string for the Supabase project is correct
- Ensure that the network has access to the Supabase database

### Wrong permissions

- Ensure that the migration SQL script is run
- Check that the RLS policy is created correctly
- Verify that the user is Supabase certified

### Foreign key constraint error

- Make sure the 'auth.users' table exists (Supabase creates it automatically)
- Verify that foreign key constraints have been created correctly
