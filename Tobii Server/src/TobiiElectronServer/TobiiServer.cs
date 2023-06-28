using System;
using System.Diagnostics;
using System.Net.Sockets;
using System.Text;
using Tobii.Interaction;
using Tobii.Interaction.Framework;
using Tobii.Interaction.Model;

/*Integrate this into a C# project that is set up to use the Tobii SDK.
  It will send the Tobii input to your electron App over UDP.
*/
namespace TobiiSDKServer
{
    class TobiiServer
    {
        static void Main(string[] args)
        {

            // Initialise Host to Tobii Connection
            var host = new Host();

            //Uncomment this section to Launch Calibration when the project opens
            /*
             System.Threading.Thread.Sleep(1000);
             host.Context.LaunchConfigurationTool(ConfigurationTool.RetailCalibration, (data) => { });
             System.Threading.Thread.Sleep(10000);
            */

            //Setup Server
            UdpClient udpClient = new UdpClient();
            udpClient.Connect("127.0.0.1", 33333);

            //Create stream. 
            var gazePointDataStream = host.Streams.CreateGazePointDataStream();
            var headPositionDataStream = host.Streams.CreateHeadPoseStream();
            var fixationDataStream = host.Streams.CreateFixationDataStream();
            var eyePositionStream = host.Streams.CreateEyePositionStream();

            // Create interactor
            // InteractorAgents are defined per window, so we need a handle to it.
            //var currentWindowHandle = Process.GetCurrentProcess().MainWindowHandle;
            var currentWindowHandle = Process.GetProcesses().ToString();
            Console.WriteLine(currentWindowHandle);

            /*
            // Let's also obtain its bounds using Windows API calls (hidden in a helper method below).
            var currentWindowBounds = GetWindowBounds(currentWindowHandle);
            // Let's create the InteractorAgent.
            var interactorAgent = host.InitializeVirtualInteractorAgent(currentWindowHandle, "ConsoleWindowAgent");

            // Next we are going to create an interactor, which we will define with the gaze aware behavior.
            // Gaze aware behavior simply tells you whether somebody is looking at the interactor or not.
            interactorAgent
                .AddInteractorFor(currentWindowBounds)
                .WithGazeAware()
                .HasGaze(() => Console.WriteLine("Hey there!"))
                .LostGaze(() => Console.WriteLine("Bye..."));
            */
            // Get the gaze data
            gazePointDataStream.GazePoint((x, y, ts) => SendGazeInput(udpClient, x, y, ts));
            headPositionDataStream.HeadPose((ts, headPosition, headRotation) => SendHeadInput(udpClient, ts, headPosition, headRotation));
            fixationDataStream.Data((x, y, ts) => SendFixationInput(udpClient, x, y, ts));
            eyePositionStream.EyePosition((eyeData) => SendEyeInput(udpClient, eyeData));

            // Read
            Console.ReadKey();

            // we will close the coonection to the Tobii Engine before exit.
            host.DisableConnection();

            //ToDo: Add code to boot your Electron App here

        }

        static void SendGazeInput(UdpClient client, double x, double y, double ts)
        {
            String sendString = @"{""id"":""gaze_data"", ""x"":" + x + @", ""y"": " + y + @", ""timestamp"":" + ts + @"}";
            Byte[] senddata = Encoding.ASCII.GetBytes(sendString);
            client.Send(senddata, senddata.Length);
        }

        static void SendHeadInput(UdpClient client, double ts, Vector3 position, Vector3 rotation)
        {
            String sendString = @"{""id"":""head_data"", ""x"":" + position.X + @", ""y"": " + position.Y + @",  ""z"": " + position.Z + @", 
            ""yaw"": " + rotation.X + @", ""pitch"": " + rotation.Y + @", ""roll"": " + rotation.Z + @",
            ""timestamp"":" + ts + @"}";
            Byte[] senddata = Encoding.ASCII.GetBytes(sendString);
            client.Send(senddata, senddata.Length);
        }

        static void SendFixationInput(UdpClient client, double x, double y, double ts)
        {
            String sendString = @"{""id"":""fixation_data"", ""x"":" + x + @", ""y"": " + y + @", ""timestamp"":" + ts + @"}";
            Byte[] senddata = Encoding.ASCII.GetBytes(sendString);
            client.Send(senddata, senddata.Length);
        }

        static void SendEyeInput(UdpClient client, EyePositionData eyeData)
        {
            String sendString = @"{""id"":""eye_data"", ""left_eye_x"":" + eyeData.LeftEye.X + @", ""left_eye_y"": " + eyeData.LeftEye.Y + @", ""left_eye_z"": " + eyeData.LeftEye.Z +
            @", ""right_eye_x"": " + eyeData.RightEye.X + @", ""right_eye_y"": " + eyeData.RightEye.Y + @", ""right_eye_z"": " + eyeData.RightEye.Z +
            @", ""timestamp"":" + eyeData.Timestamp + @"}";
            Byte[] senddata = Encoding.ASCII.GetBytes(sendString);
            client.Send(senddata, senddata.Length);
        }
    }
}
