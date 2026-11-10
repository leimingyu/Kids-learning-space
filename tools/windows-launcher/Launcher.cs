using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Kids Learning Space Launcher")]
[assembly: AssemblyDescription("Opens the existing Kids Learning Space launcher from this folder.")]
[assembly: AssemblyProduct("Kids Learning Space")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace KidsLearningSpace
{
    internal static class Launcher
    {
        private const string BatchName = "Play Kids Learning Space.bat";
        private const string ShortcutName = "Play Kids Learning Space";

        [STAThread]
        private static int Main(string[] args)
        {
            string executable = Assembly.GetExecutingAssembly().Location;
            string folder = Path.GetDirectoryName(executable);
            string missing = MissingFile(folder);

            // Read-only diagnostic for release checks. Never starts the game.
            if (args.Length == 1 && args[0] == "--check")
                return missing == null ? 0 : 2;

            if (args.Length > 0 && !(args.Length == 1 && args[0] == "--create-shortcut"))
            {
                ShowError("Double-click this launcher to play, or use Create Kids Learning Space Shortcut.bat to create a desktop shortcut.");
                return 64;
            }
            if (missing != null)
            {
                ShowError("Keep this launcher inside the complete Kids Learning Space folder.\n\nA required file is missing: " + missing + "\n\nMove the whole folder together, or use the original batch launcher.");
                return 2;
            }

            try
            {
                if (args.Length == 1)
                {
                    string shortcut = CreateShortcut(executable, Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
                    MessageBox.Show("Your fox shortcut is ready:\n\n" + shortcut + "\n\nDouble-click it to open Kids Learning Space.",
                        "Kids Learning Space", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }

                // Keep Python detection, port checks, browser opening and save paths
                // in the existing launcher/server. The command is constant: the
                // folder is passed only as WorkingDirectory, never as command text.
                // This also preserves literal percent signs in moved folder names.
                ProcessStartInfo start = new ProcessStartInfo();
                start.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
                start.Arguments = "/d /v:off /s /c \"\"Play Kids Learning Space.bat\"\"";
                start.WorkingDirectory = folder;
                start.UseShellExecute = false;
                start.CreateNoWindow = false;
                start.WindowStyle = ProcessWindowStyle.Minimized;
                Process child = Process.Start(start);
                if (child == null) throw new InvalidOperationException("Windows could not start the batch launcher.");
                child.Dispose();
                return 0;
            }
            catch (Exception error)
            {
                ShowError("The launcher could not finish.\n\n" + error.Message + "\n\nYou can still open " + BatchName + " in the game folder.");
                return 1;
            }
        }

        private static string MissingFile(string folder)
        {
            foreach (string relative in new string[] { BatchName, "index.html", Path.Combine("tools", "kls_server.py") })
                if (!File.Exists(Path.Combine(folder, relative))) return relative;
            return null;
        }

        // Also exercised directly by the isolated Windows regression tests.
        public static string CreateShortcut(string executable, string destinationDirectory)
        {
            executable = Path.GetFullPath(executable);
            if (!File.Exists(executable)) throw new FileNotFoundException("The game launcher could not be found.", executable);
            if (String.IsNullOrWhiteSpace(destinationDirectory) || !Directory.Exists(destinationDirectory))
                throw new DirectoryNotFoundException("The shortcut destination could not be found.");
            string destination = Path.Combine(destinationDirectory, ShortcutName + ".lnk");
            int number = 2;
            while (File.Exists(destination) || Directory.Exists(destination))
                destination = Path.Combine(destinationDirectory, ShortcutName + " (" + number++ + ").lnk");

            object link = null;
            IntPtr target = IntPtr.Zero;
            try
            {
                link = new ShellLink();
                IShellLinkW shortcut = (IShellLinkW)link;
                // A filesystem item ID preserves literal %name% path segments;
                // WScript's TargetPath setter can reinterpret them as variables.
                target = ILCreateFromPathW(executable);
                if (target == IntPtr.Zero) throw new IOException("Windows could not locate the game launcher.");
                shortcut.SetIDList(target);
                shortcut.SetWorkingDirectory(Path.GetDirectoryName(executable));
                shortcut.SetIconLocation(executable, 0);
                shortcut.SetDescription("Play Kids Learning Space");
                shortcut.SetShowCmd(1);
                ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Save(destination, true);
                return destination;
            }
            finally
            {
                if (link != null && Marshal.IsComObject(link)) Marshal.FinalReleaseComObject(link);
                if (target != IntPtr.Zero) ILFree(target);
            }
        }

        private static void ShowError(string message)
        {
            MessageBox.Show(message, "Kids Learning Space", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern IntPtr ILCreateFromPathW(string path);
        [DllImport("shell32.dll", ExactSpelling = true)]
        private static extern void ILFree(IntPtr item);

        [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
        private class ShellLink { }

        // IShellLinkW's complete native vtable, in its documented order.
        [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellLinkW
        {
            void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, IntPtr findData, uint flags);
            void GetIDList(out IntPtr item);
            void SetIDList(IntPtr item);
            void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder description, int length);
            void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string description);
            void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int length);
            void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
            void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int length);
            void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
            void GetHotkey(out short hotkey);
            void SetHotkey(short hotkey);
            void GetShowCmd(out int command);
            void SetShowCmd(int command);
            void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, out int index);
            void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
            void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
            void Resolve(IntPtr window, uint flags);
            void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
        }
    }
}
