import re

file_path = 'e:/projects_window/reader-hub/scrapling/parsers.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern: something_el.text  (used as value extraction from CSS results)
# We need to replace patterns like:
#   title_el.text or "Unknown"  ->  get_text(title_el) or "Unknown"  
#   author_el.text or ""        ->  get_text(author_el) or ""
#   desc_el.text or ""          ->  get_text(desc_el) or ""
#   info_el.text or ""          ->  get_text(info_el) or ""
#   link.text or ""             ->  get_text(link) or ""
#   title_el.text               ->  get_text(title_el)
#   genre_el.text               ->  get_text(genre_el)

# But NOT: self.text, status_text, title_text, clean_text, etc.

# Strategy: replace `VARNAME.text` where VARNAME is a CSS result variable
# These are patterns like: variable_name.text followed by ) or space or or

# More targeted: replace `.text or` and `.text)` patterns on element variables
# Pattern: (word_el|link|btn|json_ld).text
new_content = re.sub(
    r'\b(\w+_el|link|btn|json_ld)\.text\b',
    r'get_text(\1)',
    content
)

old_count = len(re.findall(r'\b(\w+_el|link|btn|json_ld)\.text\b', content))
new_count = len(re.findall(r'\b(\w+_el|link|btn|json_ld)\.text\b', new_content))
print(f"Replacements made: {old_count - new_count}")

# Verify python syntax
try:
    compile(new_content, file_path, 'exec')
    print("Syntax check passed!")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("File saved successfully.")
except SyntaxError as e:
    print(f"Syntax error: {e}")
    print("NOT saving file.")
