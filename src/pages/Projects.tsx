import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import {
  Plus,
  Briefcase,
  MapPin,
  Users,
  User,
  ArrowUpRight,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    if (!user) return;

    try {
      const all = await projectsApi.getAll();

      let list = all as Project[];

      if (user.role !== 'admin' && user.projectIds?.length) {
        list = list.filter(project =>
          user.projectIds!.includes(project.id)
        );
      }

      setProjects(list);
    } catch (error) {
      console.error('Load projects error:', error);
      toast.error('فشل تحميل المشاريع');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <Layout>
      <div dir="rtl" className="space-y-6 page-in text-right">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              المشاريع
            </h1>

            <p className="text-muted-foreground mt-1 text-sm">
              إدارة مشاريع الصيانة والمهندسين المسؤولين
            </p>
          </div>

          {user?.role === 'admin' && (
            <ProjectForm
              trigger={
                <Button className="gap-2 shrink-0">
                  <Plus className="w-4 h-4" />
                  مشروع جديد
                </Button>
              }
            />
          )}
        </div>

        {/* Loading */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="bg-card border border-border rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-5 shimmer rounded-md" />
                  <div className="w-10 h-10 shimmer rounded-xl" />
                </div>

                <div className="h-6 shimmer rounded-lg w-3/4 ml-auto" />
                <div className="h-4 shimmer rounded-lg w-1/2 ml-auto" />

                <div className="h-px bg-border" />

                <div className="flex justify-between">
                  <div className="h-4 shimmer rounded-lg w-1/4" />
                  <div className="h-4 shimmer rounded-lg w-1/4" />
                </div>
              </div>
            ))}
          </div>

        ) : projects.length === 0 ? (

          /* Empty */
          <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-muted-foreground" />
            </div>

            <h3 className="text-foreground font-bold text-lg">
              لا توجد مشاريع
            </h3>

            <p className="text-muted-foreground text-sm mt-1 mb-5">
              {user?.role === 'admin'
                ? 'ابدأ بإنشاء مشروعك الأول'
                : 'لا توجد مشاريع مخصصة لك بعد'}
            </p>

            {user?.role === 'admin' && <ProjectForm />}
          </div>

        ) : (

          /* Projects */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {projects.map(project => (

              <div
                key={project.id}
                role="link"
                tabIndex={0}
                aria-label={`فتح مشروع ${project.name}`}
                onClick={() => navigate(`/projects/${project.id}`)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/projects/${project.id}`);
                  }
                }}
                className="
                  bg-card
                  border border-border
                  rounded-3xl
                  p-5 sm:p-6
                  group
                  hover:border-primary/30
                  hover:shadow-xl
                  hover:-translate-y-0.5
                  focus-visible:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-primary/50
                  transition-all
                  duration-300
                  h-full
                  flex
                  flex-col
                  cursor-pointer
                "
              >

                {/* Top */}
                <div className="flex items-start justify-between mb-5">

                  <span dir="ltr" className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-lg">
                    {project.abbreviation}
                  </span>

                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 shrink-0">
                    <Briefcase className="w-5 h-5" />
                  </div>

                </div>

                {/* Title + Location */}
                <div className="text-right flex-1">

                  <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                    {project.name}
                  </h3>

                  <div className="flex items-center gap-1.5 mt-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-sm">
                      {project.location || 'لم يُحدد الموقع'}
                    </span>
                  </div>

                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-border">

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-xl bg-primary/5 border border-primary/10 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-primary">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-lg font-black tabular-nums">{project.supervisorIds?.length || 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">مشرفون</p>
                    </div>
                    <div className="rounded-xl bg-purple-500/5 border border-purple-500/10 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-purple-500">
                        <User className="w-3.5 h-3.5" />
                        <span className="text-lg font-black tabular-nums">{project.engineerIds?.length || 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">مهندسون</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">

                    {/* View Tickets */}
                    <Link
                      to={`/projects/${project.id}`}
                      className="shrink-0"
                      onClick={event => event.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="
                          text-primary
                          gap-1
                          p-0
                          h-auto
                          font-bold
                          text-xs
                          hover:bg-transparent
                          group-hover:-translate-x-0.5
                          transition-transform
                        "
                      >
                        عرض التذاكر
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>

                    {/* Edit */}
                    {user?.role === 'admin' && (
                      <div onClick={event => event.stopPropagation()}>
                        <ProjectForm
                          project={project}
                          onSuccess={loadProjects}
                          trigger={
                          <Button
                            type="button"
                            variant="outline"
                            className="
                              h-9
                              px-3
                              rounded-xl
                              gap-1.5
                              text-xs
                              font-bold
                              border-primary/20
                              text-primary
                              hover:bg-primary/10
                              hover:text-primary
                              shrink-0
                            "
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            تعديل
                          </Button>
                          }
                        />
                      </div>
                    )}

                  </div>

                </div>

              </div>
            ))}

            {/* Add Project Card */}
            {user?.role === 'admin' && (
              <ProjectForm
                trigger={
                  <button
                    type="button"
                    className="
                      w-full
                      bg-card
                      border-2
                      border-dashed
                      border-border
                      rounded-2xl
                      p-5
                      flex
                      flex-col
                      items-center
                      justify-center
                      text-center
                      gap-3
                      hover:border-primary/40
                      hover:bg-primary/[0.02]
                      transition-all
                      cursor-pointer
                      min-h-[180px]
                      group
                    "
                  >
                    <div className="
                      w-12
                      h-12
                      rounded-2xl
                      bg-muted
                      flex
                      items-center
                      justify-center
                      text-muted-foreground
                      group-hover:bg-primary/10
                      group-hover:text-primary
                      transition-all
                    ">
                      <Plus className="w-6 h-6" />
                    </div>

                    <span className="
                      text-muted-foreground
                      group-hover:text-foreground
                      font-semibold
                      text-sm
                      transition-colors
                    ">
                      إضافة مشروع جديد
                    </span>
                  </button>
                }
              />
            )}

          </div>
        )}

      </div>
    </Layout>
  );
}
