/**
 * Data Backup & Export Utility
 * Allows admins to export and import application data directly from Supabase.
 */

import {
  fetchDrivers,
  fetchRiders,
  fetchLocations,
  fetchTripsHistory,
  fetchStats,
  saveDriver,
  saveRider,
  saveLocationInDB,
  saveTripToHistory,
  saveStats,
} from '../supabaseService';

export interface BackupData {
  version: string;
  timestamp: string;
  drivers: any[];
  riders: any[];
  locations: any[];
  tripsHistory: any[];
  stats: any;
}

export const exportBackup = async (): Promise<BackupData | null> => {
  try {
    const [drivers, riders, locations, tripsHistory, stats] = await Promise.all([
      fetchDrivers(),
      fetchRiders(),
      fetchLocations(),
      fetchTripsHistory(),
      fetchStats(),
    ]);

    const backup: BackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      drivers: drivers || [],
      riders: riders || [],
      locations: locations || [],
      tripsHistory: (tripsHistory as any[]) || [],
      stats: stats || {},
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezz_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return backup;
  } catch (error) {
    console.error('Backup export failed:', error);
    return null;
  }
};

export const importBackup = async (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const backup: BackupData = JSON.parse(e.target?.result as string);
        
        if (!backup.version || !backup.timestamp) {
          reject(new Error('Invalid backup file format'));
          return;
        }

        const writes: Promise<boolean>[] = [];

        if (backup.drivers) {
          backup.drivers.forEach(d => writes.push(saveDriver(d)));
        }
        if (backup.riders) {
          backup.riders.forEach(r => writes.push(saveRider(r)));
        }
        if (backup.locations) {
          backup.locations.forEach(l => writes.push(saveLocationInDB(l)));
        }
        if (backup.tripsHistory) {
          backup.tripsHistory.forEach(t => writes.push(saveTripToHistory(t)));
        }
        if (backup.stats) {
          writes.push(saveStats(backup.stats));
        }

        await Promise.allSettled(writes);
        resolve(true);
      } catch (error) {
        reject(new Error('Failed to parse backup file'));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read backup file'));
    reader.readAsText(file);
  });
};
