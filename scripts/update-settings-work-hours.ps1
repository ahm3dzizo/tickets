# Script to update Settings.tsx
$file = 'd:\APP\tickets-main\tickets\src\pages\Settings.tsx'
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Update imports
$content = $content -replace "MessageSquare, RefreshCw, Wifi, WifiOff, Download,", "MessageSquare, RefreshCw, Wifi, WifiOff, Download, Clock, Plus, Trash2,"

# 2. Add state and functions
$stateInject = @'
  // ── Work Hours ─────────────────────────────────────────────────────────────
  const [workHours, setWorkHours] = useState<{ label: string; value: string }[]>([]);
  const [loadingWorkHours, setLoadingWorkHours] = useState(false);
  const [savingWorkHours, setSavingWorkHours] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin' && openSection === 'workhours') {
      loadWorkHours();
    }
  }, [openSection, user?.role]);

  const loadWorkHours = async () => {
    setLoadingWorkHours(true);
    try {
      const data = await settingsApi.getWorkHours();
      setWorkHours(data || []);
    } catch {
      toast.error('تعذر تحميل أوقات الدوام');
    } finally {
      setLoadingWorkHours(false);
    }
  };

  const saveWorkHours = async () => {
    setSavingWorkHours(true);
    try {
      await settingsApi.updateWorkHours(workHours);
      toast.success('تم حفظ أوقات الدوام بنجاح');
    } catch {
      toast.error('تعذر حفظ أوقات الدوام');
    } finally {
      setSavingWorkHours(false);
    }
  };

  const addWorkHour = () => {
    setWorkHours([...workHours, { label: 'فترة جديدة (مثال: 8 ص - 12 م)', value: 'فترة جديدة (مثال: 8 ص - 12 م)' }]);
  };

  const removeWorkHour = (idx: number) => {
    setWorkHours(workHours.filter((_, i) => i !== idx));
  };

  const updateWorkHour = (idx: number, text: string) => {
    const arr = [...workHours];
    arr[idx] = { label: text, value: text };
    setWorkHours(arr);
  };

'@

$content = $content.Replace("  // ── Initials avatar ────────────────────────────────────────────────────────", $stateInject + "`r`n  // ── Initials avatar ────────────────────────────────────────────────────────")

# 3. Add JSX section
$jsxInject = @'
        {/* ── Work Hours ──────────────────────────────────────────────────── */}
        {user?.role === 'admin' && (
          <Section icon={Clock} title="أوقات الدوام" desc="تحديد الفترات المتاحة لحجز مواعيد الصيانة"
            accent="amber" open={openSection === 'workhours'} onToggle={() => toggle('workhours')}>
            <div className="space-y-6">
              {loadingWorkHours ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
              ) : (
                <>
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-4">
                    <p className="text-sm font-bold text-amber-500 text-right">الفترات المتاحة للمواعيد:</p>
                    <div className="space-y-3">
                      {workHours.map((wh, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <button
                            onClick={() => removeWorkHour(idx)}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Input
                            value={wh.label}
                            onChange={e => updateWorkHour(idx, e.target.value)}
                            className="text-right bg-background/70 border-border"
                            dir="rtl"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={addWorkHour} variant="outline" className="text-amber-500 border-amber-500/20 hover:bg-amber-500/10 gap-2 h-9 rounded-xl">
                        <Plus className="w-4 h-4" />
                        إضافة فترة
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-start pt-2">
                    <Button onClick={saveWorkHours} disabled={savingWorkHours} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 px-6 font-bold">
                      {savingWorkHours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                      حفظ أوقات الدوام
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Section>
        )}

'@

$content = $content.Replace("        {/* ── Logout ──────────────────────────────────────────────────────── */}", $jsxInject + "        {/* ── Logout ──────────────────────────────────────────────────────── */}")

Set-Content $file -Value $content -Encoding UTF8 -NoNewline
Write-Host "Done"
