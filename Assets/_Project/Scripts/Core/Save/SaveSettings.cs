using System;
using UnityEngine;

namespace NightExpress.Core.Save
{
    /// <summary>Save tuning, edited on the GameConfig asset (Save section).</summary>
    [Serializable]
    public sealed class SaveSettings
    {
        public const string DefaultFileKey = "nightexpress_save";

        private const float DefaultMinSecondsBetweenAutosaves = 2f;
        private const float DefaultPeriodicSaveSeconds = 30f;
        private const float MinPeriodicSaveSeconds = 5f;

        [Tooltip("Save file name (no extension) inside Application.persistentDataPath.")]
        [SerializeField] private string fileKey = DefaultFileKey;

        [Tooltip("After something important changes (an unlock, a purchase), wait at least this long before writing. " +
                 "Batches a burst of changes into a single write.")]
        [Min(0f)]
        [SerializeField] private float minSecondsBetweenAutosaves = DefaultMinSecondsBetweenAutosaves;

        [Tooltip("Safety save interval even when nothing was flagged, so play time and timestamps stay fresh if the app crashes.")]
        [Min(MinPeriodicSaveSeconds)]
        [SerializeField] private float periodicSaveSeconds = DefaultPeriodicSaveSeconds;

        [Tooltip("Write indented JSON in the Editor so save files are easy to read. Device builds always write compact JSON.")]
        [SerializeField] private bool prettyPrintInEditor = true;

        public SaveSettings()
        {
        }

        public SaveSettings(string fileKey, float minSecondsBetweenAutosaves, float periodicSaveSeconds, bool prettyPrintInEditor)
        {
            this.fileKey = fileKey;
            this.minSecondsBetweenAutosaves = minSecondsBetweenAutosaves;
            this.periodicSaveSeconds = periodicSaveSeconds;
            this.prettyPrintInEditor = prettyPrintInEditor;
        }

        public string FileKey => string.IsNullOrEmpty(fileKey) ? DefaultFileKey : fileKey;
        public float MinSecondsBetweenAutosaves => minSecondsBetweenAutosaves;
        public float PeriodicSaveSeconds => Mathf.Max(MinPeriodicSaveSeconds, periodicSaveSeconds);
        public bool PrettyPrint => prettyPrintInEditor && Application.isEditor;
    }
}
