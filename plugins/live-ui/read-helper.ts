export const readerProgram = String.raw`
import os, sys, json, stat, errno, base64

def read_source(root, path, opener=os.open, statter=os.fstat):
    handles = []
    try:
        if os.open not in os.supports_dir_fd or not hasattr(os, 'O_NOFOLLOW'):
            return {'data': None, 'error': 'Secure directory-relative reads are unavailable on this host', 'revoked': True}
        if not isinstance(root, str) or not root.startswith('/') or len(root) > 16384:
            raise PermissionError()
        parts = path.split('/') if isinstance(path, str) else []
        if not parts or any(p in ('', '.', '..') or '\\' in p or '\x00' in p for p in parts):
            raise PermissionError()
        dirs = [p for p in root.split('/') if p]
        if any(p in ('.', '..') or '\x00' in p for p in dirs):
            raise PermissionError()
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        current = opener('/', flags)
        handles.append(current)
        for part in dirs + parts[:-1]:
            current = opener(part, flags, dir_fd=current)
            handles.append(current)
        fd = opener(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=current)
        handles.append(fd)
        info = statter(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > 262144:
            return {'data': None, 'error': 'Source must be a regular JSON file up to 256 KiB', 'revoked': False}
        data = bytearray()
        while len(data) <= 262144:
            chunk = os.read(fd, min(65536, 262145 - len(data)))
            if not chunk: break
            data.extend(chunk)
        if len(data) > 262144:
            return {'data': None, 'error': 'Source exceeds 256 KiB', 'revoked': False}
        return {'data': base64.b64encode(data).decode('ascii'), 'error': None, 'revoked': False}
    except OSError as error:
        denied = error.errno in (errno.EACCES, errno.EPERM, errno.ELOOP, errno.ENOTDIR) or isinstance(error, PermissionError)
        return {'data': None, 'error': 'Source access denied' if denied else 'Source removed' if error.errno == errno.ENOENT else 'Source unavailable', 'revoked': denied}
    finally:
        for fd in reversed(handles):
            os.close(fd)

if __name__ == '__main__':
    try:
        request = json.loads(sys.stdin.read(32769))
        result = read_source(request['root'], request['path'])
    except Exception:
        result = {'data': None, 'error': 'Invalid source request', 'revoked': True}
    print(json.dumps(result))
`;
