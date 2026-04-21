import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Plus, Briefcase, MapPin, Hash, User, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { format } from 'date-fns';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

import { Link } from 'react-router-dom';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    projectsApi.getAll().then((all: any[]) => {
      let list = all as Project[];
      if (user.role !== 'admin' && user.projectIds?.length) {
        list = list.filter(p => user.projectIds!.includes(p.id));
      }
      setProjects(list);
    }).catch(() => toast.error('فشل تحميل المشاريع'))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-3xl font-bold text-white tracking-tight">المشاريع</h1>
            <p className="text-slate-500 mt-1">إدارة مشاريع الصيانة والمهندسين المسؤولين</p>
          </div>
          {user?.role === 'admin' && <ProjectForm />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`}>
              <Card className="bg-card border-border hover:border-blue-500/30 transition-all group cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">
                      {project.abbreviation}
                    </span>
                  </div>
                  <CardTitle className="text-xl font-bold text-white mt-4 text-right">{project.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400 text-sm justify-end">
                    <span>{project.location}</span>
                    <MapPin className="w-4 h-4" />
                  </div>
                  
                  <div className="pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {project.engineerIds.slice(0, 3).map((id, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-card flex items-center justify-center text-[10px] font-bold text-slate-400">
                          ENG
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{project.engineerIds.length} مهندسين</span>
                      <User className="w-3 h-3" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{project.supervisorIds.length} مشرفين</span>
                      <Users className="w-3 h-3" />
                    </div>
                    <div className="text-[10px] text-slate-600 font-medium">
                      أنشئ في {format(new Date(project.createdAt), 'yyyy/MM/dd')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
