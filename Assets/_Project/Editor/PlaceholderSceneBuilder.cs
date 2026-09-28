using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace NightExpress.EditorTools
{
    /// <summary>
    /// Builds the M0 gray-box scene: portrait camera at the game's tilt, warm light, ground, rails, one rusty
    /// carriage and a locomotive. It exists to prove framing and the device build; M1 replaces the contents
    /// with the real playable layout. The train runs along +Z: locomotive at the top of the screen.
    /// </summary>
    public static class PlaceholderSceneBuilder
    {
        // Camera: ~52 degrees down, framing roughly 1.5 carriages in portrait.
        private const float CameraPitch = 52f;
        private const float CameraHeight = 16f;
        private const float CameraFieldOfView = 40f;
        private const float CameraNearClip = 0.3f;
        private const float CameraFarClip = 150f;

        // Train dimensions in metres.
        private const float CarriageLength = 12f;
        private const float CarriageWidth = 3.2f;
        private const float FloorThickness = 0.3f;
        private const float FloorTopHeight = 0.8f;
        private const float WallHeight = 1.1f;
        private const float WallThickness = 0.2f;
        private const float CouplingGap = 1f;
        private const float LocomotiveLength = 8f;
        private const float LocomotiveWidth = 3f;
        private const float LocomotiveHeight = 2.8f;
        private const float ChimneyHeight = 1.2f;
        private const float ChimneyDiameter = 0.8f;
        private const float CouplingMarkerSize = 1.6f;
        private const float CouplingMarkerThickness = 0.05f;

        // Scenery.
        private const float GroundLength = 120f;
        private const float GroundWidth = 60f;
        private const float PlaneSize = 10f; // Unity's plane primitive is 10 x 10 m.
        private const float RailGauge = 1.5f;
        private const float RailWidth = 0.12f;
        private const float RailHeight = 0.15f;
        private const float BallastWidth = 3.6f;
        private const float BallastHeight = 0.05f;

        // Countryside palette: golden greens and cream.
        private static readonly Color SkyColor = new Color(0.98f, 0.86f, 0.62f);
        private static readonly Color SunColor = new Color(1f, 0.93f, 0.8f);
        private static readonly Color AmbientSky = new Color(0.85f, 0.87f, 0.95f);
        private static readonly Color AmbientEquator = new Color(0.8f, 0.76f, 0.62f);
        private static readonly Color AmbientGround = new Color(0.45f, 0.42f, 0.3f);
        private static readonly Color GrassColor = new Color(0.56f, 0.71f, 0.33f);
        private static readonly Color BallastColor = new Color(0.58f, 0.53f, 0.46f);
        private static readonly Color RailColor = new Color(0.36f, 0.36f, 0.4f);
        private static readonly Color FloorColor = new Color(0.95f, 0.9f, 0.78f);
        private static readonly Color RustColor = new Color(0.63f, 0.33f, 0.22f);
        private static readonly Color LocomotiveColor = new Color(0.13f, 0.27f, 0.21f);
        private static readonly Color BrassColor = new Color(0.83f, 0.66f, 0.3f);

        private const float SunIntensity = 1.15f;
        private static readonly Vector3 SunRotation = new Vector3(50f, -30f, 0f);

        [MenuItem(SetupConstants.MenuRoot + "Setup/3. Create Placeholder Game Scene", priority = 3)]
        public static void CreateFromMenu()
        {
            Create(true);
        }

        /// <summary>Returns false if the user cancelled.</summary>
        public static bool Create(bool askBeforeReplacing)
        {
            bool exists = AssetDatabase.LoadAssetAtPath<SceneAsset>(SetupConstants.GameScenePath) != null;
            if (exists && askBeforeReplacing && !EditorUtility.DisplayDialog(
                    "Replace Game scene?",
                    $"{SetupConstants.GameScenePath} already exists. Rebuild it from scratch? Any manual changes to it will be lost.",
                    "Rebuild", "Keep existing"))
            {
                AddToBuildSettings();
                return false;
            }

            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return false;
            }

            EditorAssetUtility.EnsureFolder(SetupConstants.ScenesFolder);
            EditorAssetUtility.EnsureFolder(SetupConstants.PlaceholderMaterialsFolder);

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            CreateCamera();
            CreateLighting();
            CreateScenery();
            CreateTrain();

            EditorSceneManager.SaveScene(scene, SetupConstants.GameScenePath);
            AddToBuildSettings();
            Debug.Log($"[Setup] Placeholder scene saved to {SetupConstants.GameScenePath} and set as the only scene in the build.");
            return true;
        }

        private static void AddToBuildSettings()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(SetupConstants.GameScenePath) == null)
            {
                return;
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(SetupConstants.GameScenePath, true) };
        }

        private static void CreateCamera()
        {
            var cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = CameraFieldOfView;
            camera.nearClipPlane = CameraNearClip;
            camera.farClipPlane = CameraFarClip;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = SkyColor;
            cameraObject.AddComponent<AudioListener>();

            // Place the camera so the screen centre looks at the middle of the first carriage.
            float distanceBack = CameraHeight / Mathf.Tan(CameraPitch * Mathf.Deg2Rad);
            cameraObject.transform.SetPositionAndRotation(
                new Vector3(0f, CameraHeight, -distanceBack),
                Quaternion.Euler(CameraPitch, 0f, 0f));
        }

        private static void CreateLighting()
        {
            var sunObject = new GameObject("Sun");
            var sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = SunColor;
            sun.intensity = SunIntensity;
            sun.shadows = LightShadows.Hard; // Soft shadows cost too much on mid-range phones.
            sunObject.transform.rotation = Quaternion.Euler(SunRotation);

            RenderSettings.sun = sun;
            RenderSettings.skybox = null;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = AmbientSky;
            RenderSettings.ambientEquatorColor = AmbientEquator;
            RenderSettings.ambientGroundColor = AmbientGround;
        }

        private static void CreateScenery()
        {
            var root = new GameObject("Scenery (placeholder)").transform;

            GameObject ground = CreatePrimitive(PrimitiveType.Plane, "Grass", root, "PH_Grass", GrassColor);
            ground.transform.localScale = new Vector3(GroundWidth / PlaneSize, 1f, GroundLength / PlaneSize);

            GameObject ballast = CreatePrimitive(PrimitiveType.Cube, "Ballast", root, "PH_Ballast", BallastColor);
            SetBox(ballast, new Vector3(0f, BallastHeight * 0.5f, 0f), new Vector3(BallastWidth, BallastHeight, GroundLength));

            for (int side = -1; side <= 1; side += 2)
            {
                GameObject rail = CreatePrimitive(PrimitiveType.Cube, side < 0 ? "Rail_L" : "Rail_R", root, "PH_Rail", RailColor);
                SetBox(rail, new Vector3(side * RailGauge * 0.5f, BallastHeight + RailHeight * 0.5f, 0f), new Vector3(RailWidth, RailHeight, GroundLength));
            }
        }

        private static void CreateTrain()
        {
            var train = new GameObject("Train (placeholder)").transform;

            // Carriage 1, centred on the origin: the rusty first carriage from the player fantasy.
            var carriage = new GameObject("Carriage_01").transform;
            carriage.SetParent(train, false);

            GameObject floor = CreatePrimitive(PrimitiveType.Cube, "Floor", carriage, "PH_CarriageFloor", FloorColor);
            SetBox(floor, new Vector3(0f, FloorTopHeight - FloorThickness * 0.5f, 0f), new Vector3(CarriageWidth, FloorThickness, CarriageLength));

            float wallY = FloorTopHeight + WallHeight * 0.5f;
            float sideX = (CarriageWidth - WallThickness) * 0.5f;
            float endZ = (CarriageLength - WallThickness) * 0.5f;

            GameObject leftWall = CreatePrimitive(PrimitiveType.Cube, "Wall_L", carriage, "PH_Rust", RustColor);
            SetBox(leftWall, new Vector3(-sideX, wallY, 0f), new Vector3(WallThickness, WallHeight, CarriageLength));

            GameObject rightWall = CreatePrimitive(PrimitiveType.Cube, "Wall_R", carriage, "PH_Rust", RustColor);
            SetBox(rightWall, new Vector3(sideX, wallY, 0f), new Vector3(WallThickness, WallHeight, CarriageLength));

            GameObject frontWall = CreatePrimitive(PrimitiveType.Cube, "Wall_Front", carriage, "PH_Rust", RustColor);
            SetBox(frontWall, new Vector3(0f, wallY, endZ), new Vector3(CarriageWidth, WallHeight, WallThickness));

            GameObject rearWall = CreatePrimitive(PrimitiveType.Cube, "Wall_Rear", carriage, "PH_Rust", RustColor);
            SetBox(rearWall, new Vector3(0f, wallY, -endZ), new Vector3(CarriageWidth, WallHeight, WallThickness));

            // Locomotive ahead of the carriage (top of the screen).
            float locomotiveZ = CarriageLength * 0.5f + CouplingGap + LocomotiveLength * 0.5f;
            GameObject locomotive = CreatePrimitive(PrimitiveType.Cube, "Locomotive", train, "PH_Locomotive", LocomotiveColor);
            SetBox(locomotive, new Vector3(0f, FloorTopHeight + LocomotiveHeight * 0.5f - FloorThickness, locomotiveZ),
                new Vector3(LocomotiveWidth, LocomotiveHeight, LocomotiveLength));

            GameObject chimney = CreatePrimitive(PrimitiveType.Cylinder, "Chimney", train, "PH_Brass", BrassColor);
            float chimneyZ = locomotiveZ + LocomotiveLength * 0.3f;
            float chimneyY = FloorTopHeight - FloorThickness + LocomotiveHeight + ChimneyHeight * 0.5f;
            chimney.transform.localPosition = new Vector3(0f, chimneyY, chimneyZ);
            // The cylinder primitive is 2 m tall, so its Y scale is half the desired height.
            chimney.transform.localScale = new Vector3(ChimneyDiameter, ChimneyHeight * 0.5f, ChimneyDiameter);

            // Where the rear-coupling unlock tile will sit (M4): the train's signature growth moment.
            float markerZ = -(CarriageLength * 0.5f + CouplingGap * 0.5f + CouplingMarkerSize * 0.5f);
            GameObject marker = CreatePrimitive(PrimitiveType.Cube, "RearCoupling_Marker", train, "PH_Brass", BrassColor);
            SetBox(marker, new Vector3(0f, BallastHeight + RailHeight + CouplingMarkerThickness, markerZ),
                new Vector3(CouplingMarkerSize, CouplingMarkerThickness, CouplingMarkerSize));
        }

        private static GameObject CreatePrimitive(PrimitiveType type, string name, Transform parent, string materialName, Color color)
        {
            GameObject primitive = GameObject.CreatePrimitive(type);
            primitive.name = name;
            primitive.transform.SetParent(parent, false);
            primitive.GetComponent<MeshRenderer>().sharedMaterial = GetOrCreateMaterial(materialName, color);
            return primitive;
        }

        private static void SetBox(GameObject box, Vector3 localPosition, Vector3 size)
        {
            box.transform.localPosition = localPosition;
            box.transform.localScale = size;
        }

        private static Material GetOrCreateMaterial(string materialName, Color color)
        {
            string path = $"{SetupConstants.PlaceholderMaterialsFolder}/{materialName}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                return existing;
            }

            var material = new Material(FindPlaceholderShader())
            {
                color = color,
                enableInstancing = true,
            };
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        private static Shader FindPlaceholderShader()
        {
            // Simple Lit is URP's cheapest lit shader and reads well for flat-shaded gray-box art.
            Shader shader = Shader.Find("Universal Render Pipeline/Simple Lit");
            if (shader == null)
            {
                shader = Shader.Find("Universal Render Pipeline/Lit");
            }

            if (shader == null)
            {
                Debug.LogWarning("[Setup] URP shaders not found. Is the project using the Universal 3D template? Falling back to Standard.");
                shader = Shader.Find("Standard");
            }

            return shader;
        }
    }
}
