import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Plus, Briefcase, MapPin, Users, User, ArrowUpRight } from 'lucide-react';
import { projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { format } from 'date-fns';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    projectsApi.getAll()
      .then((all: any[]) => {
        let list = all as Project[];
        if (user.role !== 'admin' && user.projectIds?.length) {
          list = list.filter(p => user.projectIds!.includes(p.id));
        }
        setProjects(list);
      })
      .catch(() => toast.error('فشل تحميل المشاريع'))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <Layout>
      <div className="space-y-6 page-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">المشاريع</h1>
            <p className="text-muted-foreground mt-1 text-sm">إدارة مشاريع الصيانة والمهندسين المسؤولين</p>
          </div>
          {user?.role === 'admin' && <ProjectForm />}
        </div>

        {/* Loading skeletons */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-4">
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
          <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-foreground font-bold text-lg">لا توجد مشاريع</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-5">
              {user?.role === 'admin' ? 'ابدأ بإنشاء مشروعك الأول' : 'لا توجد مشاريع مخصصة لك بعد'}
            </p>
            {user?.role === 'admin' && <ProjectForm />}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <div className="bg-card border border-border rounded-2xl p-5 group hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer h-full flex flex-col">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-lg">
                      {project.abbreviation}
                    </span>
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 shrink-0">
                      <Briefcase className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Title + Location */}
                  <div className="text-right flex-1">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5 justify-end mt-1.5 text-muted-foreground">
                      <span className="text-sm">{project.location}</span>
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <Button
                      variant="ghost"
                      className="text-primary gap-1 p-0 h-auto font-bold text-xs hover:bg-transparent group-hover:-translate-x-0.5 transition-transform"
                    >
                      عرض التذاكر
                    </Button>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{project.supervisorIds?.length || 0}</span>
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{project.engineerIds?.length || 0}</span>
                        <User className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {/* Add project card */}
            {user?.role === 'admin' && (
              <ProjectForm trigger={
                <button className="w-full bg-card border-2 border-dashed border-border rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-3 hover:border-primary/40 hover:bg-primary/2 transition-all cursor-pointer min-h-[180px] group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground font-semibold text-sm transition-colors">
                    إضافة مشروع جديد
                  </span>
                </button>
              } />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
