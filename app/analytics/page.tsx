'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardAnalytics from '@/components/DashboardAnalytics';
import BackfillModal from '@/components/BackfillModal';
import { DailyRecord } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';

export default function AnalyticsPage() {
    const [records, setRecords] = useState<DailyRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        setLoading(true);
        fetch('/api/records?days=90')
            .then((res) => res.json())
            .then((data) => {
                setRecords(data.records);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Error fetching records:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50">
                <div className="w-12 h-12 border-4 border-zinc-300 border-t-zinc-800 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-50 relative overflow-hidden font-sans text-zinc-900 selection:bg-zinc-200">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-multiply pointer-events-none" />
            <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-transparent blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10 px-4 sm:px-8 py-12 md:py-20">
                <header className="mb-12 flex items-end justify-between border-b border-zinc-200 pb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Link>
                        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
                            Analytics
                        </h1>
                    </div>
                    <div className="flex items-center">
                        <BackfillModal onSuccess={fetchData} />
                    </div>
                </header>

                <DashboardAnalytics records={records} />
            </div>
        </main>
    );
}
