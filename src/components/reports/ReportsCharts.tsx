import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';

type ReportPoint = {
  label: string;
  value: number;
};

type TimelinePoint = {
  date: string;
  total: number;
};

type Props = {
  statusData: ReportPoint[];
  typeData: ReportPoint[];
  projectData: ReportPoint[];
  timelineData: { label: string; value: number }[];
  maintenanceGENERALData: ReportPoint[];
  projectCumulativeTimeline: TimelinePoint[];
  selectedProjectName?: string;
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export function ReportsCharts({
  statusData,
  typeData,
  projectData,
  timelineData,
  maintenanceGENERALData,
  projectCumulativeTimeline,
  selectedProjectName,
}: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="bg-card border-border rounded-3xl">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب الحالة</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-3xl">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب التخصص</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="value"
                  nameKey="label"
                  outerRadius={110}
                  innerRadius={55}
                  paddingAngle={4}
                >
                  {typeData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-3xl">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-4">أنواع الصيانة العامة</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={maintenanceGENERALData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {maintenanceGENERALData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={['#f59e0b', '#3b82f6', '#10b981'][index % 3]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-3xl">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-4">التذاكر حسب المشروع</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={projectData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-3xl xl:col-span-1">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-4">الاتجاه الزمني العام للتذاكر</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={timelineData.map((i) => ({ date: i.label, total: i.value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-3xl xl:col-span-1">
        <CardContent className="p-5">
          <h3 className="text-white font-bold text-lg text-right mb-1">
            الجدول الزمني التراكمي للمشروع
          </h3>
          <p className="text-slate-500 text-xs text-right mb-4">
            {selectedProjectName ? `المشروع المحدد: ${selectedProjectName}` : 'كل المشاريع'}
          </p>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={projectCumulativeTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}