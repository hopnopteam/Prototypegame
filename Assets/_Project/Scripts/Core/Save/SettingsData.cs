using System;

namespace NightExpress.Core.Save
{
    [Serializable]
    public sealed class SettingsData
    {
        public bool soundOn = true;
        public bool musicOn = true;
        public bool hapticsOn = true;
    }
}
