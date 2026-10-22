"""
MATLAB Runtime R2023a (v9.14) Registry & Environment Check Helper
"""
import sys
import os
import subprocess
import json

def is_matlab_runtime_v914_installed():
    """
    Checks Windows Registry, Program Files, and Environment for MATLAB Runtime R2023a (v9.14).
    Returns (installed: bool, details: dict)
    """
    details = {
        "installed": False,
        "version": "9.14 (R2023a)",
        "found_in": None,
        "install_dir": None,
        "installer_path": None,
        "installer_exists": False
    }

    installer_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__),
        "MATLAB_Runtime_R2023a_Update_8_win64",
        "setup.exe"
    ))
    details["installer_path"] = installer_path
    details["installer_exists"] = os.path.isfile(installer_path)

    # 1. Check Registry under MathWorks
    try:
        import winreg
        registry_paths = [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\MathWorks\MATLAB Runtime\v914"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\MathWorks\MATLAB Runtime\9.14"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\MathWorks\MATLAB Runtime\v9.14"),
            (winreg.HKEY_CURRENT_USER, r"Software\MathWorks\MATLAB Runtime\v914"),
            (winreg.HKEY_CURRENT_USER, r"Software\MathWorks\MATLAB Runtime\9.14"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\MathWorks\MATLAB Runtime\v914"),
        ]

        # Check with standard and 64-bit access rights
        for access in [winreg.KEY_READ, winreg.KEY_READ | winreg.KEY_WOW64_64KEY]:
            for hive, path in registry_paths:
                try:
                    with winreg.OpenKey(hive, path, 0, access) as key:
                        details["installed"] = True
                        details["found_in"] = f"Registry: {path}"
                        try:
                            val, _ = winreg.QueryValueEx(key, "MATLABROOT")
                            details["install_dir"] = val
                        except OSError:
                            pass
                        return True, details
                except OSError:
                    continue

        # 2. Check Registry Uninstall entries
        uninstall_paths = [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        ]

        for hive, uninst in uninstall_paths:
            try:
                with winreg.OpenKey(hive, uninst, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as parent:
                    subkeys_count = winreg.QueryInfoKey(parent)[0]
                    for idx in range(subkeys_count):
                        try:
                            subkey_name = winreg.EnumKey(parent, idx)
                            with winreg.OpenKey(parent, subkey_name) as sk:
                                try:
                                    dn, _ = winreg.QueryValueEx(sk, "DisplayName")
                                    dn_lower = dn.lower()
                                    if "matlab runtime" in dn_lower and ("r2023a" in dn_lower or "9.14" in dn_lower or "v914" in dn_lower):
                                        details["installed"] = True
                                        details["found_in"] = f"Uninstall Registry: {dn}"
                                        try:
                                            loc, _ = winreg.QueryValueEx(sk, "InstallLocation")
                                            details["install_dir"] = loc
                                        except OSError:
                                            pass
                                        return True, details
                                except OSError:
                                    pass
                        except OSError:
                            continue
            except OSError:
                continue

    except ImportError:
        pass

    # 3. Check Program Files default directories
    candidate_dirs = [
        r"C:\Program Files\MATLAB\MATLAB Runtime\R2023a",
        r"C:\Program Files\MATLAB\MATLAB Runtime\v914",
        r"C:\Program Files (x86)\MATLAB\MATLAB Runtime\R2023a",
        r"C:\Program Files (x86)\MATLAB\MATLAB Runtime\v914",
    ]
    for c_dir in candidate_dirs:
        # Check if directory has runtime/bin files
        bin_path = os.path.join(c_dir, "runtime", "win64")
        if os.path.isdir(bin_path):
            details["installed"] = True
            details["found_in"] = f"Directory: {c_dir}"
            details["install_dir"] = c_dir
            return True, details

    # 4. Check PATH environment variable
    path_env = os.environ.get("PATH", "")
    for part in path_env.split(os.pathsep):
        if "v914" in part.lower() or "r2023a" in part.lower():
            if os.path.isdir(part):
                details["installed"] = True
                details["found_in"] = f"PATH env: {part}"
                details["install_dir"] = part
                return True, details

    return False, details


def trigger_matlab_installer(installer_path):
    """
    Triggers silent installation of MATLAB Runtime R2023a.
    """
    if not os.path.isfile(installer_path):
        print(f"[ERROR] MATLAB Runtime installer not found at: {installer_path}")
        return False

    cmd = [installer_path, "-mode", "silent", "-agreeToLicense", "yes"]
    print(f"[*] Triggering MATLAB Runtime silent installer:")
    print(f"    {' '.join(cmd)}")
    print("[*] Please wait, installation can take several minutes...")

    try:
        proc = subprocess.run(cmd, check=True)
        print("[+] Installer process finished with return code:", proc.returncode)
        return proc.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Installer failed with exit code: {e.returncode}")
        return False
    except Exception as e:
        print(f"[ERROR] Failed to start installer: {e}")
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description="MATLAB Runtime R2023a Check & Install Helper")
    parser.add_argument("--json", action="store_true", help="Output JSON results")
    parser.add_argument("--install-if-missing", action="store_true", help="Automatically trigger installer if not found")
    parser.add_argument("--check-only", action="store_true", help="Only check, exit 0 if installed, 1 if missing")
    args = parser.parse_args()

    installed, details = is_matlab_runtime_v914_installed()

    if args.json:
        print(json.dumps(details, indent=2))
        sys.exit(0 if installed else 1)

    if installed:
        print(f"[OK] MATLAB Runtime R2023a (v9.14) is installed.")
        print(f"     Source: {details['found_in']}")
        if details['install_dir']:
            print(f"     Location: {details['install_dir']}")
        sys.exit(0)
    else:
        print(f"[!] MATLAB Runtime R2023a (v9.14) NOT detected.")
        if args.install_if_missing:
            if details["installer_exists"]:
                success = trigger_matlab_installer(details["installer_path"])
                sys.exit(0 if success else 1)
            else:
                print(f"[ERROR] Local installer missing at: {details['installer_path']}")
                sys.exit(1)
        else:
            if details["installer_exists"]:
                print(f"[*] Local installer is available at: {details['installer_path']}")
            sys.exit(1)


if __name__ == "__main__":
    main()
